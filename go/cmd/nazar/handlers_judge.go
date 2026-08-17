package main

import (
	"fmt"
	"net/http"
	"time"

	"nazar/internal/contract"
)

// The judge-facing payer app (docs/08-BRANDKIT.md S0): a judge scans a QR on the console,
// lands on a mobile page, and makes real payments that flow through the exact same
// s.DecideAndPersist path as everything else. handleJudgeSession exists only to give that
// session a believable identity before the judge's own taps become live decisions — it
// seeds a fresh payer with real (small, unremarkable) transaction history via the same
// production-shaped path, so the first payment the judge makes isn't flagged purely for
// having zero history. Nothing about the SCORING of what the judge does next is scripted:
// their two taps hit POST /v1/decide for real and get whatever the engine actually decides.
//
// merchantAccount is shared across all judge sessions on purpose — a real small merchant
// that's seen many distinct payers looks exactly like what it is (docs/06's
// test_merchant_is_not_a_ring point, reused here for realism, not just correctness).
const judgeMerchantAccount = "BANK_A-JUDGE-CHAI-POINT"

type judgeSessionResponse struct {
	SessionID       string `json:"session_id"`
	PayerAccount    string `json:"payer_account"`
	MerchantAccount string `json:"merchant_account"`
	MerchantLabel   string `json:"merchant_label"`
	ScamAccount     string `json:"scam_account"`
	ScamLabel       string `json:"scam_label"`
}

func (s *Server) handleJudgeSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	run := time.Now().UnixNano()

	payer := fmt.Sprintf("BANK_A-JUDGE-%d", run)
	scam := fmt.Sprintf("BANK_A-JUDGE-SCAM-%d", run)

	// Seed real warm-up history for this payer through the real decision path — same pattern
	// as demo scenario A — so it has an account age, an hour histogram, and a velocity
	// baseline by the time the judge's own first tap happens.
	for i := 0; i < 6; i++ {
		ev := &contract.Event{
			EndToEndID:            fmt.Sprintf("judge-%d-seed%d", run, i),
			Rail:                  contract.RailUPI,
			DebtorAccount:         payer,
			CreditorAccount:       judgeMerchantAccount,
			InstructedAmountMinor: 8000 + int64(i)*500,
			Initiation:            "INTENT",
		}
		if _, _, err := s.DecideAndPersist(ctx, ev); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "seeding session: " + err.Error()})
			return
		}
	}

	resp := judgeSessionResponse{
		SessionID:       fmt.Sprintf("judge-%d", run),
		PayerAccount:    payer,
		MerchantAccount: judgeMerchantAccount,
		MerchantLabel:   "Chai Point",
		ScamAccount:     scam,
		ScamLabel:       "KYC Verification Cell",
	}

	// Remember it so the presenter view on the big screen can follow this exact phone
	// without anyone typing an account number mid-demo.
	s.judgeMu.Lock()
	s.judgeSession = &resp
	s.judgeMu.Unlock()
	s.hub.Publish("judge_session", resp)

	writeJSON(w, http.StatusOK, resp)
}

// GET /v1/judge/session — whichever phone most recently scanned the QR. The console's
// presenter view polls this so it can highlight that payer's transactions as they land.
func (s *Server) handleJudgeSessionActive(w http.ResponseWriter, r *http.Request) {
	s.judgeMu.Lock()
	sess := s.judgeSession
	s.judgeMu.Unlock()
	if sess == nil {
		writeJSON(w, http.StatusOK, map[string]any{"session": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"session": sess})
}
