package narrate

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

// OpenAINarrator speaks the OpenAI chat-completions wire format, which Groq, vLLM,
// llama.cpp's server, Ollama and every on-premise inference server in practice all serve.
// That is the entire portability story: the demo points at Groq, production points at a box
// inside the bank's own network, and nothing in this file changes.
type OpenAINarrator struct {
	BaseURL string
	// APIKeys is tried in order on every call. A hosted inference endpoint fails in ways
	// that are specific to one credential — per-key rate limits, a revoked or expired key,
	// a per-key quota — and those are exactly the failures that show up mid-demo. Rotating
	// on that class of error costs one extra round trip and removes a whole category of
	// live embarrassment. Genuine content failures are NOT retried on another key.
	APIKeys   []string
	Model     string
	Provider  string
	OnPremise bool
	Client    *http.Client

	// active remembers the key index that last worked, so a healthy key is tried first
	// rather than walking the dead one every time.
	active atomic.Int64
}

const (
	defaultGroqBase = "https://api.groq.com/openai/v1"
	defaultModel    = "openai/gpt-oss-120b"
	// Off the request path, but an analyst is still waiting at a screen.
	requestTimeout = 25 * time.Second
)

// FromEnv builds the configured narrator, falling back to the deterministic one when no
// endpoint is available. It never returns nil.
//
//	GROQ_API_KEY / NAZAR_LLM_API_KEY   credential (comma-separated for failover)
//	NAZAR_LLM_BASE_URL                 OpenAI-compatible base URL (default: Groq)
//	NAZAR_LLM_MODEL                    model id
//
// Pointing NAZAR_LLM_BASE_URL at http://llm.internal:8000/v1 with no key is exactly the
// air-gapped deployment — same code, no egress.
func FromEnv() Narrator {
	base := strings.TrimRight(envOr("NAZAR_LLM_BASE_URL", defaultGroqBase), "/")
	model := envOr("NAZAR_LLM_MODEL", defaultModel)

	// Accept one key or several. Several is the normal case for a demo: free-tier keys
	// rate-limit per key, and a talk is the worst possible time to discover that.
	var keys []string
	for _, raw := range []string{os.Getenv("NAZAR_LLM_API_KEYS"), os.Getenv("NAZAR_LLM_API_KEY"), os.Getenv("GROQ_API_KEY")} {
		for _, k := range strings.Split(raw, ",") {
			if k = strings.TrimSpace(k); k != "" && !contains(keys, k) {
				keys = append(keys, k)
			}
		}
	}

	onPrem := !strings.Contains(base, "://api.groq.com") &&
		!strings.Contains(base, "://api.openai.com") &&
		!strings.Contains(base, "://api.anthropic.com")

	provider := "on-premise (OpenAI-compatible)"
	if strings.Contains(base, "api.groq.com") {
		provider = "Groq"
	}
	// A hosted endpoint without a key cannot work; a local one usually needs none.
	if len(keys) == 0 && !onPrem {
		return DeterministicNarrator{}
	}
	if len(keys) == 0 {
		keys = []string{""} // on-premise servers commonly need no credential
	}
	return &OpenAINarrator{
		BaseURL: base, APIKeys: keys, Model: model, Provider: provider, OnPremise: onPrem,
		Client: &http.Client{Timeout: requestTimeout},
	}
}

func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func (n *OpenAINarrator) Meta() Meta {
	note := fmt.Sprintf("Hosted inference with %d credential(s) in failover. All data in this demo is synthetic, so there is no privacy surface — in production this endpoint is an on-premise OpenAI-compatible server inside the bank's network and the code is unchanged.", len(n.APIKeys))
	if n.OnPremise {
		note = "On-premise inference endpoint. No data leaves the deployment boundary."
	}
	return Meta{
		Provider: n.Provider, Model: n.Model, Endpoint: n.BaseURL,
		OnPremise: n.OnPremise, Available: true, Note: note,
	}
}

const systemPrompt = `You are the explanation layer of Nazar, a real-time payments fraud detection system used by bank fraud analysts in India.

You will be given a STRUCTURED BRIEF describing one payment decision that the system has ALREADY made. Your job is to explain that decision to a human analyst in clear, calm, professional English.

Hard rules:
- The decision is final and already taken. Explain it; never second-guess it, never propose a different action.
- Use ONLY facts present in the brief. If something is not in the brief, you do not know it. Never invent an amount, a name, a probability, a rule, a time or a location.
- Never describe the customer as a fraudster. The system detects risk in transactions, not guilt in people. Say "this payment shows X", not "this customer is committing fraud".
- Amounts are Indian rupees, already formatted. Reproduce them exactly as given.
- If checks could not be evaluated, say so plainly. Absence of evidence is not evidence.
- No markdown, no headings, no bullet characters in the text itself.

Respond with ONLY a JSON object, no prose around it:
{
  "summary": "2-3 sentences an analyst reads first: what happened and why the system responded this way.",
  "reasoning": ["3-6 short paragraphs walking through the evidence in order of importance, including what came back clear and what could not be checked."],
  "next_steps": ["2-4 concrete actions for this analyst right now."]
}`

type chatRequest struct {
	Model          string        `json:"model"`
	Messages       []chatMessage `json:"messages"`
	Temperature    float64       `json:"temperature"`
	MaxTokens      int           `json:"max_tokens"`
	ResponseFormat *respFormat   `json:"response_format,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type respFormat struct {
	Type string `json:"type"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

func (n *OpenAINarrator) Narrate(ctx context.Context, b Brief) (*Result, error) {
	if err := assertNoFreeText(b); err != nil {
		return nil, err
	}
	briefJSON, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("narrate: encoding brief: %w", err)
	}

	body, err := json.Marshal(chatRequest{
		Model: n.Model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: "STRUCTURED BRIEF:\n" + string(briefJSON)},
		},
		Temperature:    0.2, // low: this is an explanation of a fixed record, not creative writing
		MaxTokens:      1200,
		ResponseFormat: &respFormat{Type: "json_object"},
	})
	if err != nil {
		return nil, fmt.Errorf("narrate: encoding request: %w", err)
	}

	start := time.Now()
	raw, err := n.postWithFailover(ctx, body)
	if err != nil {
		return nil, err
	}

	var cr chatResponse
	if err := json.Unmarshal(raw, &cr); err != nil {
		return nil, fmt.Errorf("narrate: decoding response: %w", err)
	}
	if cr.Error != nil {
		return nil, fmt.Errorf("narrate: model error: %s", cr.Error.Message)
	}
	if len(cr.Choices) == 0 {
		return nil, fmt.Errorf("narrate: model returned no choices")
	}

	var parsed struct {
		Summary   string   `json:"summary"`
		Reasoning []string `json:"reasoning"`
		NextSteps []string `json:"next_steps"`
	}
	content := strings.TrimSpace(cr.Choices[0].Message.Content)
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		// The model answered but not in the shape we asked for. Surface what it said rather
		// than dropping it — an analyst can still read prose.
		parsed.Summary = truncate(content, 1500)
	}

	return &Result{
		Summary: parsed.Summary, Reasoning: parsed.Reasoning, NextSteps: parsed.NextSteps,
		Provider: n.Provider, Model: n.Model, Endpoint: n.BaseURL, OnPremise: n.OnPremise,
		LatencyMs: float64(time.Since(start).Microseconds()) / 1000.0,
		Note:      "Written by a language model from Nazar's structured findings. The decision itself was made before this ran and does not depend on it.",
	}, nil
}

// postWithFailover tries each credential in turn, starting from the one that last worked.
// It rotates only on failures a different key could plausibly fix — auth, quota, rate limit,
// or a server-side error — and returns immediately on anything else, because retrying a
// malformed request four times just makes the same mistake more slowly.
func (n *OpenAINarrator) postWithFailover(ctx context.Context, body []byte) ([]byte, error) {
	var lastErr error
	start := int(n.active.Load())
	for attempt := 0; attempt < len(n.APIKeys); attempt++ {
		idx := (start + attempt) % len(n.APIKeys)
		key := n.APIKeys[idx]

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.BaseURL+"/chat/completions", bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		if key != "" {
			req.Header.Set("Authorization", "Bearer "+key)
		}

		resp, err := n.Client.Do(req)
		if err != nil {
			// Transport failure: no network, DNS, TLS. Another key will not help, but the
			// caller falls back to the deterministic narrator, which is the real safety net.
			lastErr = fmt.Errorf("narrate: calling %s: %w", n.BaseURL, err)
			break
		}
		raw, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("narrate: reading response: %w", readErr)
			continue
		}

		if resp.StatusCode == http.StatusOK {
			n.active.Store(int64(idx)) // remember the healthy key
			return raw, nil
		}
		lastErr = fmt.Errorf("narrate: credential %d/%d got %d: %s",
			idx+1, len(n.APIKeys), resp.StatusCode, truncate(string(raw), 200))
		if !retryableWithAnotherKey(resp.StatusCode) {
			return nil, lastErr
		}
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("narrate: no credentials configured")
	}
	return nil, lastErr
}

func retryableWithAnotherKey(status int) bool {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusPaymentRequired,
		http.StatusTooManyRequests, http.StatusRequestTimeout:
		return true
	}
	return status >= 500
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

const chatSystemPrompt = `You are the analyst assistant inside Nazar, a real-time payments fraud detection system used by bank fraud analysts in India.

You are given a STRUCTURED BRIEF describing ONE payment decision the system has ALREADY made. An analyst will ask you questions about it. Answer them.

Hard rules:
- The decision is final and was made before you ran. Explain and interpret it; never claim to have made it, never propose overriding it.
- Ground every factual claim in the brief. If the analyst asks something the brief does not contain — the customer's name, their balance, what happened yesterday, whether they are guilty — say plainly that the record does not contain it. Never invent an amount, a name, a probability, a rule, a time or a location.
- Never describe the customer as a fraudster. The system detects risk in transactions, not guilt in people.
- Amounts are Indian rupees, already formatted. Reproduce them exactly as given.
- If the analyst asks something outside this decision entirely (general fraud typology, how the system works, what a term means), you may answer from general knowledge — but say clearly that you are doing so rather than reading it off this record.
- Be concise. Two or three short paragraphs at most. Plain prose, no markdown headings, no bullet characters.`

// Chat answers analyst follow-ups about one decision. Identical transport, credentials and
// failover as Narrate — the only difference is that the conversation is replayed after the
// brief, so every answer stays anchored to the record rather than drifting.
func (n *OpenAINarrator) Chat(ctx context.Context, b Brief, history []Turn) (*Answer, error) {
	if err := assertNoFreeText(b); err != nil {
		return nil, err
	}
	turns := SanitiseTurns(history)
	if len(turns) == 0 {
		return nil, fmt.Errorf("narrate: no question asked")
	}
	briefJSON, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("narrate: encoding brief: %w", err)
	}

	msgs := []chatMessage{
		{Role: "system", Content: chatSystemPrompt},
		{Role: "user", Content: "STRUCTURED BRIEF for the decision under discussion:\n" + string(briefJSON)},
		{Role: "assistant", Content: "I have the decision record. Ask me anything about it."},
	}
	for _, t := range turns {
		msgs = append(msgs, chatMessage{Role: t.Role, Content: t.Content})
	}

	body, err := json.Marshal(chatRequest{
		Model:       n.Model,
		Messages:    msgs,
		Temperature: 0.3, // a shade warmer than the write-up; still not creative writing
		MaxTokens:   800,
	})
	if err != nil {
		return nil, fmt.Errorf("narrate: encoding request: %w", err)
	}

	start := time.Now()
	raw, err := n.postWithFailover(ctx, body)
	if err != nil {
		return nil, err
	}
	var cr chatResponse
	if err := json.Unmarshal(raw, &cr); err != nil {
		return nil, fmt.Errorf("narrate: decoding response: %w", err)
	}
	if cr.Error != nil {
		return nil, fmt.Errorf("narrate: model error: %s", cr.Error.Message)
	}
	if len(cr.Choices) == 0 {
		return nil, fmt.Errorf("narrate: model returned no choices")
	}
	return &Answer{
		Reply:     strings.TrimSpace(cr.Choices[0].Message.Content),
		Provider:  n.Provider,
		Model:     n.Model,
		OnPremise: n.OnPremise,
		LatencyMs: float64(time.Since(start).Microseconds()) / 1000.0,
		Grounded:  true,
		Note:      "Answered by a language model from Nazar's structured findings. The decision was made before this ran and does not depend on it.",
	}, nil
}
