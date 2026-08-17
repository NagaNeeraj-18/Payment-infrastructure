import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ActionTag } from "../components/ActionTag";
import { formatMinor, formatTimeMs, truncateMid } from "../lib/format";
import { useDecisionStream } from "../lib/useDecisionStream";

const NOVEL_THRESHOLD = 0.05;
const CHART_W = 720;
const CHART_H = 220;
const PAD = 28;

/** Live anomaly detection: go/internal/novelty's real feature-space k-NN + conformal
 * p-value, computed on every decision (shadow only — never influences the action). This
 * screen reads from the SAME live stream Live Monitor does, so every new decision that
 * lands updates the scatter, histogram, and counts immediately — nothing here polls. */
export function AnomalyDetection() {
  const navigate = useNavigate();
  const { rows, connState } = useDecisionStream();

  const evaluated = useMemo(() => rows.filter((r) => r.novelty_evaluated), [rows]);
  const warming = rows.length - evaluated.length;
  const novel = useMemo(() => evaluated.filter((r) => r.novelty_p_value < NOVEL_THRESHOLD), [evaluated]);

  const scatter = useMemo(() => {
    if (evaluated.length === 0) return [];
    const ordered = [...evaluated].reverse(); // oldest -> newest, left to right
    const n = ordered.length;
    return ordered.map((r, i) => {
      const x = n === 1 ? PAD : PAD + (i / (n - 1)) * (CHART_W - 2 * PAD);
      const anomaly = 1 - r.novelty_p_value; // higher = more anomalous, more intuitive on a chart
      const y = CHART_H - PAD - anomaly * (CHART_H - 2 * PAD);
      return { x, y, r, anomaly };
    });
  }, [evaluated]);

  const histogram = useMemo(() => {
    const buckets = new Array(10).fill(0);
    for (const r of evaluated) {
      let idx = Math.floor(r.novelty_p_value * 10);
      if (idx >= 10) idx = 9;
      if (idx < 0) idx = 0;
      buckets[idx]++;
    }
    return buckets;
  }, [evaluated]);
  const histMax = Math.max(1, ...histogram);

  const mostAnomalous = useMemo(
    () => [...evaluated].sort((a, b) => a.novelty_p_value - b.novelty_p_value).slice(0, 8),
    [evaluated],
  );

  return (
    <div>
      <div className="ph">
        <div>
          <h1>Anomaly Detection</h1>
          <p>
            Feature-space k-NN + conformal p-value, computed on every decision (
            <span className="mn">go/internal/novelty</span>). Shadow only — informs investigation, never blocks or
            changes an action. Updates live from the same stream as Live Monitor.
          </p>
        </div>
        <div className="sp" />
        <span className={`st ${connState === "open" ? "s-ok" : connState === "error" ? "s-sp" : "s-nt"}`}>
          <i />
          {connState === "open" ? "Stream open" : connState === "error" ? "Stream error" : "Connecting"}
        </span>
      </div>

      <div className="row r4" style={{ marginBottom: 14 }}>
        <div className="card met">
          <div className="lb">Evaluated</div>
          <div className="vl mny">{evaluated.length}</div>
          <div className="ft">
            <div className="dd">of {rows.length} decisions shown</div>
          </div>
        </div>
        <div className="card met">
          <div className="lb">Novel (p &lt; {NOVEL_THRESHOLD})</div>
          <div className="vl mny">{novel.length}</div>
          <div className="ft">
            <div className="dd">as unusual as fewer than 5% of recent traffic</div>
          </div>
        </div>
        <div className="card met">
          <div className="lb">Novelty rate</div>
          <div className="vl mny">
            {evaluated.length > 0 ? ((novel.length / evaluated.length) * 100).toFixed(1) : "—"}
            <span className="un">{evaluated.length > 0 ? "%" : ""}</span>
          </div>
          <div className="ft">
            <div className="dd">share of evaluated decisions</div>
          </div>
        </div>
        <div className="card met">
          <div className="lb">Warming up</div>
          <div className="vl mny">{warming}</div>
          <div className="ft">
            <div className="dd">cold-start — reservoir needs 30+ points</div>
          </div>
        </div>
      </div>

      <div className="sp1" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="ch">
            <h2>Anomaly score over time</h2>
            <div className="sp" />
            <span className="sub">1 − conformal p-value, live</span>
          </div>
          <div style={{ padding: "4px 18px 16px" }}>
            {scatter.length === 0 ? (
              <div style={{ color: "var(--ink4)", fontSize: 12.5, padding: "40px 0", textAlign: "center" }}>
                No evaluated decisions yet — the reservoir needs 30+ observed transactions before novelty scoring
                turns on.
              </div>
            ) : (
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: "100%", height: "auto" }}>
                <g stroke="var(--bd)">
                  <line x1={PAD} y1={PAD} x2={CHART_W - PAD} y2={PAD} />
                  <line
                    x1={PAD}
                    y1={CHART_H - PAD - (1 - NOVEL_THRESHOLD) * (CHART_H - 2 * PAD)}
                    x2={CHART_W - PAD}
                    y2={CHART_H - PAD - (1 - NOVEL_THRESHOLD) * (CHART_H - 2 * PAD)}
                    strokeDasharray="4 4"
                    stroke="var(--warn)"
                  />
                  <line x1={PAD} y1={CHART_H - PAD} x2={CHART_W - PAD} y2={CHART_H - PAD} />
                </g>
                <text x={CHART_W - PAD} y={CHART_H - PAD - (1 - NOVEL_THRESHOLD) * (CHART_H - 2 * PAD) - 4} fontSize="10" fill="var(--warn)" textAnchor="end">
                  novel threshold
                </text>
                {scatter.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={p.anomaly >= 1 - NOVEL_THRESHOLD ? 4 : 2.5}
                    fill={p.anomaly >= 1 - NOVEL_THRESHOLD ? "var(--warn)" : "var(--indigo)"}
                    opacity={p.anomaly >= 1 - NOVEL_THRESHOLD ? 0.9 : 0.45}
                  />
                ))}
              </svg>
            )}
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <h2>p-value distribution</h2>
          </div>
          <div style={{ padding: "4px 18px 16px" }}>
            {evaluated.length === 0 ? (
              <div style={{ color: "var(--ink4)", fontSize: 12.5 }}>no data yet</div>
            ) : (
              histogram.map((count, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="mn" style={{ width: 40, fontSize: 10.5, color: "var(--ink4)" }}>
                    {(i / 10).toFixed(1)}
                  </span>
                  <div style={{ flex: 1, height: 12, background: "var(--hover)", borderRadius: 99, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${(count / histMax) * 100}%`,
                        height: "100%",
                        background: i === 0 ? "var(--warn)" : "var(--indigo)",
                        borderRadius: 99,
                      }}
                    />
                  </div>
                  <span className="mn" style={{ width: 24, fontSize: 10.5, color: "var(--ink3)", textAlign: "right" }}>
                    {count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch">
          <h2>Most anomalous, right now</h2>
          <span className="badge">{mostAnomalous.length}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Payer</th>
              <th>Beneficiary</th>
              <th className="r">Amount</th>
              <th>Decision</th>
              <th className="r">p-value</th>
            </tr>
          </thead>
          <tbody>
            {mostAnomalous.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "var(--ink4)" }}>
                  Nothing evaluated yet.
                </td>
              </tr>
            )}
            {mostAnomalous.map((r) => (
              <tr key={r._id} onClick={() => navigate(`/investigate?id=${encodeURIComponent(r.end_to_end_id)}`)}>
                <td className="ts">{formatTimeMs(r.decided_at_ms)}</td>
                <td className="mn">{truncateMid(r.debtor_account, 6, 4)}</td>
                <td className="mn">{truncateMid(r.creditor_account, 6, 4)}</td>
                <td className="r">
                  <span className="mny amt">{formatMinor(r.amount_minor)}</span>
                </td>
                <td>
                  <ActionTag action={r.action} />
                </td>
                <td className="r mn" style={{ color: r.novelty_p_value < NOVEL_THRESHOLD ? "var(--warn)" : "var(--ink)" }}>
                  {r.novelty_p_value.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
