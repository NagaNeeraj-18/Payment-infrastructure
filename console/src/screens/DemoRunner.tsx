import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { DemoRunResponse, DemoScenario } from "../api/types";
import { ActionTag } from "../components/ActionTag";
import { formatMinor } from "../lib/format";

const SCENARIOS: { id: DemoScenario; title: string; blurb: string }[] = [
  { id: "A", title: "A · Normal", blurb: "Ordinary transaction → ALLOW" },
  { id: "B", title: "B · APP scam", blurb: "New beneficiary APP-scam pattern → STEP_UP_INTERSTITIAL" },
  { id: "C", title: "C · Mule fan-out", blurb: "Mule fan-out → graph ring evidence" },
  { id: "D", title: "D · Large new payee", blurb: "Large new-beneficiary payment → CAP (regulatory)" },
  { id: "E", title: "E · Redis killed", blurb: "Redis killed mid-flight → still answers, degraded, never BLOCK" },
  { id: "F", title: "F · Legit merchant", blurb: "30 payers, legitimate merchant → ring_score stays 0" },
  { id: "G", title: "G · Investigation round-trip", blurb: "Decision persisted and re-read byte-identical" },
  { id: "H", title: "H · Audit verification", blurb: "Audit chain verification" },
];

export function DemoRunner() {
  const [results, setResults] = useState<Record<DemoScenario, DemoRunResponse | undefined>>(
    {} as Record<DemoScenario, DemoRunResponse | undefined>,
  );
  const [errors, setErrors] = useState<Record<DemoScenario, string | undefined>>(
    {} as Record<DemoScenario, string | undefined>,
  );
  const [running, setRunning] = useState<DemoScenario | null>(null);

  async function run(id: DemoScenario) {
    setRunning(id);
    setErrors((prev) => ({ ...prev, [id]: undefined }));
    try {
      const res = await api.runDemo(id);
      setResults((prev) => ({ ...prev, [id]: res }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div>
      <div className="top-bar">
        <h1>Demo Runner</h1>
        <p>
          Each button fires the real scenario through the real decision path via{" "}
          <code>POST /v1/demo/run/&#123;X&#125;</code>. Scenario E actually kills and restores Redis.
        </p>
      </div>

      <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {SCENARIOS.map((s) => {
          const res = results[s.id];
          const err = errors[s.id];
          return (
            <div className="panel" key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {s.title}
                </span>
                <button className="btn" disabled={running !== null} onClick={() => run(s.id)}>
                  {running === s.id ? "Running…" : "Run"}
                </button>
              </div>
              <p className="lbl" style={{ marginBottom: 10 }}>
                {s.blurb}
              </p>

              {err && <div className="deg">POST /v1/demo/run/{s.id} failed: {err}</div>}

              {res && (
                <div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                    <span className="lbl">
                      expected <b className="mono" style={{ color: "var(--ink-900)" }}>{res.expected}</b>
                    </span>
                    <span
                      className="mono"
                      style={{ fontSize: 11, fontWeight: 600, color: res.passed ? "var(--ink-900)" : "var(--block)" }}
                    >
                      {res.passed ? "PASSED" : "FAILED"}
                    </span>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    <table className="dtable">
                      <thead>
                        <tr>
                          <th>step</th>
                          <th style={{ textAlign: "right" }}>amount</th>
                          <th>action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {res.steps.map((step, i) => (
                          <tr key={`${s.id}-${i}`}>
                            <td className="num">{step.label}</td>
                            <td className="n num">
                              {step.event
                                ? formatMinor((step.event as { instructed_amount_minor?: number }).instructed_amount_minor ?? null)
                                : "—"}
                            </td>
                            <td>
                              {step.decision ? (
                                <ActionTag action={step.decision.action} />
                              ) : (
                                <span className="lbl">{step.note ?? "—"}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {res.steps.some((st) => st.decision) && (
                    <div className="lbl" style={{ marginTop: 10 }}>
                      Open the last decision in{" "}
                      <Link
                        to={`/investigate?id=${encodeURIComponent(
                          [...res.steps].reverse().find((st) => st.decision)?.decision?.end_to_end_id ?? "",
                        )}`}
                        style={{ color: "var(--ultra-500)" }}
                      >
                        Investigation →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
