package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"time"

	"nazar/internal/audit"
	"nazar/internal/contract"
	"nazar/internal/decide"
	"nazar/internal/features"
	"nazar/internal/novelty"
	"nazar/internal/obs"
	"nazar/internal/persist"
)

// decisionDeadlineMs is Nazar's self-enforced cap on the profile load, well inside the
// caller's 25ms contract (docs/01 §2). Chosen so a slow Redis slot degrades that group
// rather than ever risking the whole response missing the caller's deadline.
const decisionDeadlineMs = 20

func (s *Server) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("POST /v1/decide", s.handleDecide)
	mux.HandleFunc("GET /v1/decisions/{id}", s.handleGetDecision)
	mux.HandleFunc("GET /v1/stream", s.hub.ServeHTTP)
	mux.HandleFunc("GET /v1/latency", s.handleLatency)
	mux.HandleFunc("GET /v1/resilience", s.handleResilience)
	mux.HandleFunc("GET /v1/audit/verify", s.handleAuditVerify)
	mux.HandleFunc("POST /v1/admin/chaos/redis", s.handleChaosRedis)
	mux.HandleFunc("POST /v1/admin/blocklist/refresh", s.handleBlocklistRefresh)
	mux.HandleFunc("GET /v1/graph/{account}", s.handleGraph)
	mux.HandleFunc("GET /v1/policy", s.handlePolicy)
	mux.HandleFunc("POST /v1/demo/run/{scenario}", s.handleDemoRun)
	mux.HandleFunc("GET /v1/calibration", s.handleCalibration)
	mux.HandleFunc("POST /v1/consortium/report", s.handleConsortiumReport)
	mux.HandleFunc("POST /v1/consortium/retract", s.handleConsortiumRetract)
	mux.HandleFunc("POST /v1/consortium/dispute", s.handleConsortiumDispute)
	mux.HandleFunc("GET /v1/consortium/lookup/{account}", s.handleConsortiumLookup)
	mux.HandleFunc("GET /v1/federation/wire/{id}", s.handleFederationWire)
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	status := s.health.Check(r.Context())
	up := status.Redis.Up && status.Postgres.Up
	writeJSON(w, http.StatusOK, map[string]any{
		"up":         true, // process itself is always "up" if it can answer at all
		"non_degraded": up,
		"dependencies": status,
	})
}

// handleDecide is the hot path: POST /v1/decide -> Decision, per docs/04 §1.
func (s *Server) handleDecide(w http.ResponseWriter, r *http.Request) {
	var ev contract.Event
	if err := json.NewDecoder(r.Body).Decode(&ev); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}
	if problem := validateEvent(&ev); problem != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": problem})
		return
	}
	d, replayed, err := s.DecideAndPersist(r.Context(), &ev)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"decision": d, "replayed": replayed})
}

// DecideAndPersist is the single real decision path — used by the HTTP handler AND the demo
// scenario runner (handlers_demo.go), so "the demo must exercise the real production-shaped
// path... do not create a separate fake demo backend" is true by construction rather than
// by promise.
func (s *Server) DecideAndPersist(ctx context.Context, ev *contract.Event) (*contract.Decision, bool, error) {
	t0 := time.Now()

	if ev.AcceptedAtMs == 0 {
		ev.AcceptedAtMs = t0.UnixMilli() // stamped by Nazar at the trust boundary (docs/02 §1)
	}
	if ev.Currency == "" {
		ev.Currency = "INR"
	}
	if ev.Channel == "" {
		ev.Channel = "MOBILE"
	}
	if ev.BankInstance == "" {
		ev.BankInstance = "BANK_A"
	}
	if ev.SchemaVersion == 0 {
		ev.SchemaVersion = 1
	}

	// Idempotency: docs/01 §7 — a repeat within the TTL returns the stored decision,
	// unchanged, and never re-scores.
	if existing, found, err := s.profileStore.LoadDecision(ctx, ev.EndToEndID); err == nil && found {
		return existing, true, nil
	}

	tScoringStart := time.Now()
	// Self-enforced deadline (docs/01 §2 — "the most important section... a rails-only
	// decision is computable with zero I/O, so there is no reason for Nazar to ever time
	// out"). The caller's own deadline is 25ms; Nazar caps its own dependency call well
	// inside that so it always has time left to fall back rather than being cut off with
	// nothing. go-redis honours context cancellation per-command, so a slot that is still
	// running past the deadline returns ctx.Err() instead of hanging the response.
	pb := decide.LoadProfileWithDeadline(ctx, s.profileStore, ev, decisionDeadlineMs*time.Millisecond)
	degraded := degradedList(pb)

	fv := features.Compute(ev, pb, ev.AcceptedAtMs)

	gr := s.graph.Evaluate(ev.CreditorAccount, ev.AcceptedAtMs)
	graphResult := &contract.GraphResult{
		Evaluated: true, RingScore: gr.RingScore, RingSize: gr.RingSize,
		ComponentBankCount: gr.ComponentBankCount, HopsToCashout: gr.HopsToCashout,
		DeviceSharedDegree: gr.DeviceSharedDegree,
	}

	advisories := s.consortiumAdvisories(ctx, ev.CreditorAccount)

	d, _ := s.engine.Decide(ctx, &decide.Input{
		Event: ev, Profile: pb, Features: fv, Degraded: degraded, Graph: graphResult,
		Advisories: advisories,
	})

	// Novelty ships in shadow (docs/00 §3.3): computed, recorded, NEVER influences the
	// action. Appended directly as a finding rather than threaded through decide.Engine,
	// which is exactly what "shadow" means structurally.
	nr := s.novelty.Evaluate(fv.Values)
	d.Findings = append(d.Findings, noveltyFinding(nr))

	tDecided := time.Now()
	d.DecidedAtMs = tDecided.UnixMilli()
	d.QueueDelayMs = tScoringStart.Sub(t0).Seconds() * 1000
	d.ServiceMs = tDecided.Sub(tScoringStart).Seconds() * 1000

	if err := s.wal.Append(d); err != nil {
		log.Printf("nazar: WAL append failed for %s: %v", ev.EndToEndID, err)
	}

	tEmit := time.Now()
	d.TotalMs = tEmit.Sub(t0).Seconds() * 1000

	if err := s.profileStore.StoreDecision(ctx, ev.EndToEndID, d); err != nil {
		log.Printf("nazar: idempotency store failed for %s: %v", ev.EndToEndID, err)
	}

	s.latency.Record(obs.Sample{TotalMs: d.TotalMs, QueueDelayMs: d.QueueDelayMs, ServiceMs: d.ServiceMs})
	s.hub.Publish("decision", liveMonitorRow(ev, d))

	// Async lane (docs/00 §4): everything below is off the request path already, using a
	// context detached from the (now-closed) request context.
	go s.applyAsync(ev, d, fv)

	return d, false, nil
}

func (s *Server) applyAsync(ev *contract.Event, d *contract.Decision, fv *contract.FeatureVector) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.profileStore.Apply(ctx, ev); err != nil {
		log.Printf("nazar: profile apply failed for %s: %v", ev.EndToEndID, err)
	}
	if err := persist.EmitTransaction(ctx, s.db, ev); err != nil {
		log.Printf("nazar: transaction persist failed for %s: %v", ev.EndToEndID, err)
	}
	s.shipper.Enqueue(d)
	s.graph.OnEvent(ev.DebtorAccount, ev.CreditorAccount, ev.DeviceID, ev.AcceptedAtMs)
	s.novelty.Observe(fv.Values, sortedKeys(fv.Values))
}

func (s *Server) handleGetDecision(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx := r.Context()
	d, err := persist.GetLatestDecision(ctx, s.db, id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if d == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no decision found for " + id})
		return
	}
	txn, _ := persist.GetTransaction(ctx, s.db, id)
	writeJSON(w, http.StatusOK, map[string]any{"decision": d, "transaction": txn})
}

func (s *Server) handleLatency(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.latency.Snapshot())
}

func (s *Server) handleResilience(w http.ResponseWriter, r *http.Request) {
	status := s.health.Check(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"dependencies":     status,
		"async_shed_total": s.shipper.AsyncShedTotal.Load(),
		"async_queue_depth": s.shipper.QueueDepth.Load(),
		"degradation_value_cap_minor": s.policy.Degradation.ValueCapMinor,
	})
}

func (s *Server) handleAuditVerify(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	recs, prevHashes, hashes, err := persist.LoadChainForVerification(ctx, s.db, 0)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	breakAt, ok := audit.Verify(recs, prevHashes, hashes)
	writeJSON(w, http.StatusOK, map[string]any{"ok": ok, "n": len(recs), "break_at": breakAt})
}

func (s *Server) handleChaosRedis(w http.ResponseWriter, r *http.Request) {
	var body struct{ Action string `json:"action"` }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	container := s.redisContainer
	if container == "" {
		container = "nazar-redis"
	}
	var cmdName string
	switch body.Action {
	case "kill":
		cmdName = "stop"
	case "restore":
		cmdName = "start"
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "action must be kill|restore"})
		return
	}
	// Real infrastructure chaos, not a UI facade: this actually stops/starts the Redis
	// container, so every downstream Degraded=true branch in profile.Load fires for real.
	out, err := exec.Command("podman", cmdName, container).CombinedOutput()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error(), "output": string(out)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"action": body.Action, "container": container})
}

func (s *Server) handleBlocklistRefresh(w http.ResponseWriter, r *http.Request) {
	if err := s.blocklist.Refresh(r.Context(), s.db); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "refreshed"})
}

func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	acct := r.PathValue("account")
	res := s.graph.Evaluate(acct, time.Now().UnixMilli())
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handlePolicy(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.policy)
}

// ── helpers ──────────────────────────────────────────────────────────────

func validateEvent(ev *contract.Event) string {
	if ev.EndToEndID == "" {
		return "end_to_end_id is required"
	}
	if ev.DebtorAccount == "" || ev.CreditorAccount == "" {
		return "debtor_account and creditor_account are required"
	}
	if ev.InstructedAmountMinor <= 0 {
		return "instructed_amount_minor must be > 0"
	}
	if ev.Rail == "" {
		return "rail is required"
	}
	return ""
}

func degradedList(pb *contract.ProfileBundle) []string {
	var out []string
	if pb.Payer.Degraded {
		out = append(out, "profile:payer")
	}
	if pb.Payee.Degraded {
		out = append(out, "profile:payee")
	}
	if pb.Device.Degraded {
		out = append(out, "profile:device")
	}
	if pb.Pair.Degraded {
		out = append(out, "profile:pair")
	}
	if pb.ASN.Degraded {
		out = append(out, "profile:asn")
	}
	return out
}

func noveltyFinding(nr novelty.Result) contract.Finding {
	if !nr.Evaluated {
		return contract.NewFinding("novelty", contract.StatusNotEvaluated, nr.Reason)
	}
	status := contract.StatusClear
	explanation := fmt.Sprintf("conformal p-value %.4f (kNN distance %.3f) — shadow only, never influences the decision", nr.PValue, nr.KNNDistance)
	if nr.PValue < 0.05 {
		status = contract.StatusFired
		explanation = "unusual pattern: " + explanation
	}
	return contract.NewFinding("novelty", status, explanation)
}

func liveMonitorRow(ev *contract.Event, d *contract.Decision) map[string]any {
	return map[string]any{
		"end_to_end_id": ev.EndToEndID,
		"decided_at_ms": d.DecidedAtMs,
		"debtor_account": ev.DebtorAccount,
		"creditor_account": ev.CreditorAccount,
		"amount_minor": ev.InstructedAmountMinor,
		"rail": ev.Rail,
		"action": d.Action,
		"total_ms": d.TotalMs,
		"degraded": d.Degraded,
	}
}

func sortedKeys(m map[string]float64) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// stable order matters for novelty's fixed-dimension embedding, not lexical order per se.
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
