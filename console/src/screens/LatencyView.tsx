import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LatencyResponse } from "../api/types";
import { PercentileLatency } from "../components/PercentileLatency";
import { formatMs } from "../lib/format";

export function LatencyView() {
  const [data, setData] = useState<LatencyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const d = await api.latency();
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    poll();
    const t = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  return (
    <div>
      <div className="top-bar">
        <h1>Latency</h1>
        <p>
          <code>GET /v1/latency</code> — total_ms distribution over the last ~10k decisions. Polled every 5s.
          This is the total figure only; queue delay and service time are per-decision and shown on
          Investigation.
        </p>
      </div>

      {error && <div className="deg">GET /v1/latency failed: {error}</div>}

      {data && (
        <div className="panel">
          <PercentileLatency data={data} />
          <table className="dtable" style={{ marginTop: 24 }}>
            <thead>
              <tr>
                <th>percentile</th>
                <th style={{ textAlign: "right" }}>total_ms</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["p50", data.p50],
                ["p90", data.p90],
                ["p99", data.p99],
                ["p99.9", data.p999],
                ["max", data.max],
              ].map(([k, v]) => (
                <tr key={k as string}>
                  <td className="num">{k}</td>
                  <td className="n num">{formatMs(v as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
