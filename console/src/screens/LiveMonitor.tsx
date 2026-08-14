import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { LatencyResponse } from "../api/types";
import { ActionTag } from "../components/ActionTag";
import { PercentileLatency } from "../components/PercentileLatency";
import { formatMinorCompact, formatMinor, formatMs, formatTimeMs, truncateMid } from "../lib/format";
import { useDecisionStream } from "../lib/useDecisionStream";

export function LiveMonitor() {
  const navigate = useNavigate();
  const { rows, connState } = useDecisionStream();
  const [latency, setLatency] = useState<LatencyResponse | null>(null);
  const [latencyErr, setLatencyErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const l = await api.latency();
        if (!cancelled) {
          setLatency(l);
          setLatencyErr(null);
        }
      } catch (e) {
        if (!cancelled) setLatencyErr(e instanceof Error ? e.message : String(e));
      }
    }
    poll();
    const t = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const metrics = useMemo(() => {
    const nonAllow = rows.filter((r) => r.action !== "ALLOW" && r.action !== "ALLOW_MONITOR");
    const valuePrevented = nonAllow.reduce((sum, r) => sum + (r.amount_minor ?? 0), 0);
    const challengeRate = rows.length > 0 ? (nonAllow.length / rows.length) * 100 : null;
    return { valuePrevented, challengeRate, n: rows.length };
  }, [rows]);

  return (
    <div>
      <div className="top-bar">
        <h1>Live Monitor</h1>
        <p>
          Real-time decisions via <code>GET /v1/stream</code> — connection{" "}
          <b className="mono">{connState}</b>
        </p>
      </div>

      {connState === "error" && (
        <div className="deg" style={{ marginBottom: 16 }}>
          Stream connection error — the backend at {api.streamUrl()} is unreachable or dropped
          the connection. No data is being invented in its place.
        </div>
      )}

      <div className="panel">
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 175px", gap: 24 }}>
          <div>
            <div className="lbl" style={{ marginBottom: 10 }}>
              Live decisions · this session ({metrics.n})
            </div>
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>ts</th>
                    <th>payer → payee</th>
                    <th style={{ textAlign: "right" }}>amount</th>
                    <th>action</th>
                    <th style={{ textAlign: "right" }}>total ms</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ color: "var(--ink-300)" }}>
                        {connState === "connecting"
                          ? "Connecting to stream…"
                          : "No decisions observed yet this session. Fire a transaction via POST /v1/decide or run a demo scenario."}
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr
                      key={r._id}
                      className={r._fresh ? "row-flash" : ""}
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/investigate?id=${encodeURIComponent(r.end_to_end_id)}`)}
                      title="Open in Investigation"
                    >
                      <td className="num">{formatTimeMs(r.decided_at_ms)}</td>
                      <td className="num">
                        {truncateMid(r.debtor_account)} → {truncateMid(r.creditor_account)}
                      </td>
                      <td className="n num">{formatMinor(r.amount_minor)}</td>
                      <td>
                        <ActionTag action={r.action} />
                      </td>
                      <td className="n num">{formatMs(r.total_ms, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="lbl" style={{ marginBottom: 10 }}>
              Session metrics
            </div>
            <div style={{ marginBottom: 18 }}>
              <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                value prevented · this session
              </span>
              <span className="hero">{formatMinorCompact(metrics.valuePrevented)}</span>
            </div>
            <div style={{ marginBottom: 18 }}>
              <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                challenge rate · this session
              </span>
              <span className="fig">
                {metrics.challengeRate === null ? "—" : `${metrics.challengeRate.toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <span className="lbl" style={{ display: "block", marginBottom: 6 }}>
            latency · GET /v1/latency (last ~10k decisions)
          </span>
          {latencyErr && <div className="deg">latency endpoint unreachable: {latencyErr}</div>}
          {!latencyErr && latency && <PercentileLatency data={latency} />}
        </div>
      </div>
    </div>
  );
}
