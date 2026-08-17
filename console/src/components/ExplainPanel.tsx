import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ExplainResponse, Narrative } from "../api/types";
import { formatMinor, formatMs } from "../lib/format";

/** The answer to "how do you actually know this is fraud?".
 *
 * Everything rendered here comes from GET /v1/decisions/{id}/explain, which reads the
 * persisted decision and re-executes the deterministic parts of it. There is no client-side
 * scoring, no invented reason text and no placeholder: if a signal did not run, this shows
 * that it did not run rather than showing a zero. */
export function ExplainPanel({ id, onClose }: { id: string; onClose?: () => void }) {
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"why" | "proof" | "money">("why");
  const [narr, setNarr] = useState<Narrative | null>(null);
  const [narrLoading, setNarrLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setNarr(null);
    api
      .explain(id)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function runNarrate() {
    setNarrLoading(true);
    try {
      const r = await api.narrate(id);
      setNarr(r.narrative);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNarrLoading(false);
    }
  }

  if (error) return <div className="deg">Could not load explanation: {error}</div>;
  if (!data)
    return (
      <div className="card xp-load">
        <span className="xp-spin" /> Reconstructing the decision…
      </div>
    );

  const { explanation: ex, determinism: det } = data;
  const maxWeight = Math.max(...ex.evidence.map((e) => e.weight), 0.0001);

  return (
    <div className="xp">
      <div className={`xp-hero o-${ex.outcome}`}>
        <div className="xp-hero-top">
          <span className={`xp-verdict o-${ex.outcome}`}>{ex.action_label}</span>
          <div className="sp" />
          <span className="xp-amt mny">{formatMinor(ex.amount_minor)}</span>
          <span className="tag">{ex.rail}</span>
          {onClose && (
            <button className="xp-x" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        <h2 className="xp-headline">{ex.headline}</h2>
        <div className="xp-hero-meta">
          <span>
            decided in <b>{formatMs(ex.total_ms, 1)}</b>
          </span>
          <span>·</span>
          <span className="mn">{ex.end_to_end_id}</span>
        </div>
      </div>

      <div className="xp-tabs">
        {(
          [
            ["why", "Why this decision"],
            ["money", "The arithmetic"],
            ["proof", "Proof it's reproducible"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`xp-tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "why" && (
        <div className="xp-body">
          {ex.narrative.map((n, i) => (
            <p key={i} className="xp-narr">
              {n}
            </p>
          ))}

          <div className="xp-sec">Evidence that fired</div>
          {ex.evidence.length === 0 && <div className="xp-empty">No signal fired on this payment.</div>}
          {ex.evidence.map((e) => (
            <div key={e.id} className="xp-ev">
              <div className={`xp-sev s-${e.severity}`} />
              <div className="xp-ev-body">
                <div className="xp-ev-top">
                  <span className="xp-ev-title">{e.title}</span>
                  <span className={`xp-src src-${e.source}`}>{e.source}</span>
                </div>
                <div className="xp-ev-detail">{e.detail}</div>
                {e.weight > 0 && (
                  <div className="xp-bar" title={`model attribution ${e.signed >= 0 ? "+" : ""}${e.signed.toFixed(4)}`}>
                    <span style={{ width: `${Math.max(3, (e.weight / maxWeight) * 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="xp-sec">
            Independent detectors
            <span className="xp-sec-note">
              these do not share a training signal — agreement between them is the real evidence
            </span>
          </div>
          <div className="xp-dets">
            {ex.detectors.map((d) => (
              <div key={d.id} className={`xp-det v-${d.verdict}`}>
                <div className="xp-det-top">
                  <span className={`xp-dot v-${d.verdict}`} />
                  <span className="xp-det-name">{d.name}</span>
                  {d.independent && <span className="xp-indep">independent</span>}
                </div>
                <div className="xp-det-sum">{d.summary}</div>
              </div>
            ))}
          </div>

          {ex.cleared.length > 0 && (
            <>
              <div className="xp-sec">Checked and clear ({ex.cleared.length})</div>
              <div className="xp-chips">
                {ex.cleared.map((c) => (
                  <span key={c.id} className="xp-chip ok" title={c.detail}>
                    {c.title}
                  </span>
                ))}
              </div>
            </>
          )}

          {ex.not_evaluated.length > 0 && (
            <>
              <div className="xp-sec">
                Could not be evaluated ({ex.not_evaluated.length})
                <span className="xp-sec-note">excluded, never scored as zero</span>
              </div>
              <div className="xp-chips">
                {ex.not_evaluated.slice(0, 14).map((c) => (
                  <span key={c.id} className="xp-chip na" title={c.reason}>
                    {c.title}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="xp-sec">Analyst write-up</div>
          {!narr && (
            <button className="pill pri" onClick={runNarrate} disabled={narrLoading}>
              {narrLoading ? "Writing…" : "Explain this to me in plain English"}
            </button>
          )}
          {narr && (
            <div className="xp-narrbox">
              <p className="xp-narr-sum">{narr.summary}</p>
              {(narr.reasoning ?? []).map((r, i) => (
                <p key={i} className="xp-narr">
                  {r}
                </p>
              ))}
              {(narr.next_steps ?? []).length > 0 && (
                <>
                  <div className="xp-sec">Next steps</div>
                  <ul className="xp-steps">
                    {(narr.next_steps ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className="xp-prov">
                {narr.deterministic ? "Generated without a language model" : `${narr.provider} · ${narr.model}`}
                {narr.on_premise ? " · stays inside the deployment boundary" : ""} — {narr.note}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "money" && (
        <div className="xp-body">
          <p className="xp-narr">
            Nazar does not have a risk threshold. It prices every option and takes the cheapest one — which is why
            the same probability produces a different response at a different amount.
          </p>
          {ex.cost_table && ex.cost_table.length > 0 ? (
            <table className="xp-cost">
              <thead>
                <tr>
                  <th>If we…</th>
                  <th className="r">Expected fraud loss</th>
                  <th className="r">Friction we impose</th>
                  <th className="r">Good business lost</th>
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {ex.cost_table.map((c) => (
                  <tr key={c.action} className={c.chosen ? "chosen" : ""}>
                    <td>
                      {ACTION_TEXT[c.action] ?? c.action}
                      {c.chosen && <span className="xp-chosen">chosen</span>}
                    </td>
                    <td className="r mny">{formatMinor(c.expected_fraud_loss_minor)}</td>
                    <td className="r mny">{formatMinor(c.friction_minor)}</td>
                    <td className="r mny">{formatMinor(c.lost_business_minor)}</td>
                    <td className="r mny b">{formatMinor(c.total_cost_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="xp-empty">
              This decision never reached the economics — a regulatory rail or the blocklist settled it first.
            </div>
          )}

          {(ex.counterfactuals ?? []).length > 0 && (
            <>
              <div className="xp-sec">What would have had to be different</div>
              {(ex.counterfactuals ?? []).map((c, i) => (
                <div key={i} className="xp-cf">
                  <div className="xp-cf-q">{c.question}</div>
                  <div className="xp-cf-a">{c.answer}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "proof" && (
        <div className="xp-body">
          <div className={`xp-proof ${det.reproduced ? "ok" : "bad"}`}>
            <div className="xp-proof-badge">{det.reproduced ? "REPRODUCED" : "DIVERGED"}</div>
            <div className="xp-proof-note">{det.note}</div>
          </div>

          <div className="xp-sec">Every value, recomputed and compared</div>
          <table className="xp-checks">
            <thead>
              <tr>
                <th />
                <th>Value</th>
                <th>Stored at decision time</th>
                <th>Recomputed just now</th>
              </tr>
            </thead>
            <tbody>
              {det.checks.map((c) => (
                <tr key={c.name}>
                  <td className={`xp-tick ${c.match ? "ok" : "bad"}`}>{c.match ? "✓" : "✕"}</td>
                  <td>
                    {c.name}
                    {c.note && <div className="xp-check-note">{c.note}</div>}
                  </td>
                  <td className="mn">{c.stored}</td>
                  <td className="mn">{c.recomputed}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="xp-sec">
            Execution trace
            <span className="xp-sec-note">the stages that actually ran, in order</span>
          </div>
          {det.trace.map((t) => (
            <div key={t.stage} className={`xp-stage oc-${t.outcome}`}>
              <div className="xp-stage-n">{t.stage}</div>
              <div className="xp-stage-body">
                <div className="xp-stage-name">
                  {t.name}
                  <span className={`xp-oc oc-${t.outcome}`}>{t.outcome.replace("_", " ")}</span>
                </div>
                <div className="xp-stage-desc">{t.description}</div>
                <div className="xp-stage-out mn">{t.output}</div>
                {t.inputs && (
                  <div className="xp-stage-in">
                    {Object.entries(t.inputs).map(([k, v]) => (
                      <span key={k}>
                        <b>{k}</b> {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="xp-vers">
            {Object.entries(ex.versions).map(([k, v]) => (
              <span key={k}>
                <b>{k}</b> <span className="mn">{v}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ACTION_TEXT: Record<string, string> = {
  ALLOW: "let it through",
  ALLOW_MONITOR: "let it through, watch it",
  STEP_UP: "ask for extra verification",
  STEP_UP_INTERSTITIAL: "warn and require confirmation",
  HOLD: "hold it for review",
};
