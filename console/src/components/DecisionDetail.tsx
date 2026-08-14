import type { Decision, TransactionRecord } from "../api/types";
import { ContributionsBar } from "./ContributionsBar";
import { DecisionBlock } from "./DecisionBlock";
import { LatencyBlock } from "./LatencyBlock";
import { StateChip } from "./StateChip";
import { formatMinor, formatMs, truncateHash, truncateMid } from "../lib/format";

interface DecisionDetailProps {
  decision: Decision;
  transaction?: TransactionRecord;
  advisoryMaxRung?: string;
}

/** The Investigation / Alert Detail view — S2, "the whole product". Also reused verbatim
 * by Time Machine: this IS the persisted record, never recomputed. */
export function DecisionDetail({ decision, transaction, advisoryMaxRung }: DecisionDetailProps) {
  const fv = decision.features;
  const featureIds = fv ? Object.keys(fv.status).sort() : [];
  const findings = decision.findings ?? [];
  const degraded = decision.degraded ?? [];

  return (
    <div>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 24, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 15, lineHeight: "22px", fontWeight: 500, marginBottom: 3 }}>
              {transaction?.instructed_amount_minor !== undefined
                ? formatMinor(transaction.instructed_amount_minor)
                : "—"}{" "}
              · {decision.rail_fired || transaction?.rail || "—"}
            </div>
            <div className="lbl" style={{ marginBottom: 18 }}>
              {decision.end_to_end_id} · {decision.kind}
              {decision.reason_codes && decision.reason_codes.length > 0
                ? ` · ${decision.reason_codes.join(", ")}`
                : ""}
            </div>

            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 20 }}>
              <div>
                <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                  p_model
                </span>
                <span className="fig num">{decision.p_model?.toFixed(4) ?? "—"}</span>
              </div>
              <div>
                <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                  p_prevalence_adj
                </span>
                <span className="fig num">{decision.p_prevalence_adj?.toFixed(4) ?? "—"}</span>
              </div>
              <div>
                <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                  expected loss
                </span>
                <span className="fig num">{formatMinor(decision.expected_loss_minor)}</span>
              </div>
              <div>
                <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                  expected cost
                </span>
                <span className="fig num">{formatMinor(decision.expected_cost_minor)}</span>
              </div>
              <div>
                <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                  latency
                </span>
                <LatencyBlock queueMs={decision.queue_delay_ms} serviceMs={decision.service_ms} totalMs={decision.total_ms} />
              </div>
            </div>

            {decision.contributions && Object.keys(decision.contributions).length > 0 ? (
              <>
                <div className="lbl" style={{ marginBottom: 10 }}>
                  Contributions · signed, positive = risk-increasing
                </div>
                <ContributionsBar contributions={decision.contributions} />
              </>
            ) : (
              <div className="lbl" style={{ color: "var(--ink-300)" }}>
                contributions: null on this decision (rails-only / rule path, no model attribution)
              </div>
            )}

            <div className="lbl" style={{ margin: "20px 0 9px" }}>
              Findings
            </div>
            {findings.length === 0 && <span style={{ color: "var(--ink-300)" }}>no findings recorded</span>}
            {findings.map((f) => (
              <StateChip key={f.signal_id} label={f.signal_id} status={f.status} reason={f.reason_code} />
            ))}
          </div>

          <DecisionBlock action={decision.action} advisoryMaxRung={advisoryMaxRung} caption={`decision · seq ${decision.decision_seq}`} />
        </div>

        <div className="foot">
          model <b>{decision.model_bundle_version || "—"}</b> &nbsp; policy{" "}
          <b>{decision.policy_version || "—"}</b> &nbsp; rules <b>{decision.rules_version || "—"}</b> &nbsp;
          registry <b>{decision.signal_registry_version || "—"}</b>
          <br />
          degraded{" "}
          <b className={degraded.length > 0 ? "w" : ""}>{degraded.length > 0 ? degraded.join(", ") : "none"}</b>
          &nbsp;·&nbsp; is_control <b>{String(decision.is_control)}</b> &nbsp;·&nbsp; action_propensity{" "}
          <b>{decision.action_propensity?.toFixed(3) ?? "—"}</b>
          <br />
          chain seq <b>{decision.chain_seq}</b> &nbsp;·&nbsp; prev_hash <b>{truncateHash(decision.prev_hash)}</b>{" "}
          &nbsp;·&nbsp; hash <b className="u">{truncateHash(decision.hash)}</b>
        </div>
      </div>

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 10 }}>
          Feature vector ({featureIds.length})
        </div>
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          <table className="dtable">
            <thead>
              <tr>
                <th>feature_id</th>
                <th style={{ textAlign: "right" }}>value</th>
                <th>status</th>
                <th>reason</th>
                <th style={{ textAlign: "right" }}>staleness</th>
              </tr>
            </thead>
            <tbody>
              {featureIds.map((id) => {
                const status = fv!.status[id];
                const value = fv!.values[id];
                const reason = fv!.reason[id];
                const stale = fv!.staleness[id];
                return (
                  <tr key={id}>
                    <td className="num">{id}</td>
                    <td className="n num">{status === "CLEAR" || status === "FIRED" ? (value ?? "—") : "—"}</td>
                    <td>
                      <StateChip label={status} status={status} reason={reason} />
                    </td>
                    <td className="num">{reason ?? "—"}</td>
                    <td className="n num">{stale !== undefined ? formatMs(stale * 1000) : "—"}</td>
                  </tr>
                );
              })}
              {featureIds.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--ink-300)" }}>
                    no feature vector on this decision record
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {transaction && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="lbl" style={{ marginBottom: 10 }}>
            Raw transaction — as persisted
          </div>
          <div className="mono" style={{ fontSize: 11, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px" }}>
            {Object.entries(transaction).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "var(--ink-500)" }}>{k}</span>
                <span className="num" style={{ textAlign: "right", wordBreak: "break-all" }}>
                  {k.includes("account") ? truncateMid(String(v), 6, 6) : String(v)}
                </span>
              </div>
            ))}
          </div>
          {"remittance_info" in transaction && (
            <div className="lbl" style={{ marginTop: 10, color: "var(--ink-300)" }}>
              remittance_info is shown here as plain text for the investigator only — it is
              attacker-controlled and is never forwarded to an LLM (CLAUDE.md non-negotiable #14).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
