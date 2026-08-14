package persist

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"nazar/internal/contract"
)

// GetLatestDecision reads the most recent LIVE decision for an end_to_end_id back out of
// Postgres, byte-for-byte as persisted — this is the query the Time Machine and the
// investigation screen both use (test_replay_is_a_read: never recomputed).
func GetLatestDecision(ctx context.Context, db *sql.DB, e2eID string) (*contract.Decision, error) {
	row := db.QueryRowContext(ctx, `
		SELECT end_to_end_id, decision_seq, kind, extract(epoch from decided_at)*1000, extract(epoch from accepted_at)*1000,
		       action, pre_advisory_action, coalesce(rail_fired,''), reason_codes,
		       p_model, p_prevalence_adj, expected_loss_minor, expected_cost_minor,
		       features, feature_status, feature_staleness, contributions, findings,
		       model_bundle_version, policy_version, rules_version, signal_registry_version,
		       is_control, action_propensity, degraded,
		       total_ms, queue_delay_ms, service_ms,
		       decision_shard, chain_seq, prev_hash, hash
		FROM decisions
		WHERE end_to_end_id = $1
		ORDER BY decision_seq DESC
		LIMIT 1`, e2eID)

	var d contract.Decision
	var kind, action, preAdv string
	var decidedAtMs, acceptedAtMs float64
	var reasonCodes, degraded pqArray
	var featuresJSON, statusJSON, stalenessJSON, contribsJSON, findingsJSON []byte
	var prevHash, hash []byte

	err := row.Scan(&d.EndToEndID, &d.DecisionSeq, &kind, &decidedAtMs, &acceptedAtMs,
		&action, &preAdv, &d.RailFired, &reasonCodes,
		&d.PModel, &d.PPrevalenceAdj, &d.ExpectedLossMinor, &d.ExpectedCostMinor,
		&featuresJSON, &statusJSON, &stalenessJSON, &contribsJSON, &findingsJSON,
		&d.ModelBundleVersion, &d.PolicyVersion, &d.RulesVersion, &d.SignalRegistryVersion,
		&d.IsControl, &d.ActionPropensity, &degraded,
		&d.TotalMs, &d.QueueDelayMs, &d.ServiceMs,
		&d.DecisionShard, &d.ChainSeq, &prevHash, &hash,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("persist: query decision: %w", err)
	}

	d.DecidedAtMs = int64(decidedAtMs)
	d.AcceptedAtMs = int64(acceptedAtMs)
	d.Kind = contract.DecisionKind(kind)
	d.Action = contract.Action(action)
	d.PreAdvisoryAction = contract.Action(preAdv)
	d.ReasonCodes = []string(reasonCodes)
	d.Degraded = []string(degraded)
	d.PrevHash = prevHash
	d.Hash = hash

	fv := contract.NewFeatureVector()
	_ = json.Unmarshal(featuresJSON, &fv.Values)
	_ = json.Unmarshal(statusJSON, &fv.Status)
	_ = json.Unmarshal(stalenessJSON, &fv.Staleness)
	d.Features = fv
	_ = json.Unmarshal(contribsJSON, &d.Contributions)
	_ = json.Unmarshal(findingsJSON, &d.Findings)

	return &d, nil
}

// GetTransaction reads the canonical event back for the investigation screen.
func GetTransaction(ctx context.Context, db *sql.DB, e2eID string) (map[string]any, error) {
	row := db.QueryRowContext(ctx, `
		SELECT end_to_end_id, extract(epoch from accepted_at)*1000, rail, channel, bank_instance,
		       debtor_account, creditor_account, coalesce(creditor_vpa,''), amount_minor, currency,
		       coalesce(device_id,''), coalesce(host(ip),''), coalesce(asn,0), coalesce(geo_cell,''), coalesce(initiation,'')
		FROM transactions WHERE end_to_end_id = $1 ORDER BY accepted_at DESC LIMIT 1`, e2eID)

	var e2e, rail, channel, bank, debtor, creditor, vpa, currency, device, ip, geo, initiation string
	var acceptedAtMs float64
	var amount int64
	var asn int
	if err := row.Scan(&e2e, &acceptedAtMs, &rail, &channel, &bank, &debtor, &creditor, &vpa, &amount, &currency, &device, &ip, &asn, &geo, &initiation); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return map[string]any{
		"end_to_end_id": e2e, "accepted_at_ms": int64(acceptedAtMs), "rail": rail, "channel": channel,
		"bank_instance": bank, "debtor_account": debtor, "creditor_account": creditor, "creditor_vpa": vpa,
		"amount_minor": amount, "currency": currency, "device_id": device, "ip": ip, "asn": asn,
		"geo_cell": geo, "initiation": initiation,
	}, nil
}

// pqArray scans a Postgres TEXT[] literal into a []string without pulling in lib/pq just
// for this. Handles the {a,b,c} format Postgres emits.
type pqArray []string

func (a *pqArray) Scan(src any) error {
	if src == nil {
		*a = nil
		return nil
	}
	var s string
	switch v := src.(type) {
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("pqArray: unsupported scan type %T", src)
	}
	s = trimBraces(s)
	if s == "" {
		*a = []string{}
		return nil
	}
	var out []string
	cur := ""
	inQuote := false
	for _, r := range s {
		switch {
		case r == '"':
			inQuote = !inQuote
		case r == ',' && !inQuote:
			out = append(out, cur)
			cur = ""
		default:
			cur += string(r)
		}
	}
	out = append(out, cur)
	*a = out
	return nil
}

func trimBraces(s string) string {
	if len(s) >= 2 && s[0] == '{' && s[len(s)-1] == '}' {
		return s[1 : len(s)-1]
	}
	return s
}
