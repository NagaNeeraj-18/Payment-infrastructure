import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { ResilienceResponse } from "../api/types";
import { formatMinor, formatMs } from "../lib/format";

export function Resilience() {
  const [data, setData] = useState<ResilienceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"kill" | "restore" | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const d = await api.resilience();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    poll();
    const t = window.setInterval(poll, 3000);
    return () => window.clearInterval(t);
  }, [poll]);

  async function doChaos(action: "kill" | "restore") {
    setBusy(action);
    setActionError(null);
    setActionResult(null);
    try {
      const res = await api.chaosRedis(action);
      setActionResult(`${res.action} -> ${res.container}`);
      // give the container a moment, then refresh dependency status
      window.setTimeout(poll, 800);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const degraded = data ? !(data.dependencies.redis.up && data.dependencies.postgres.up) : false;

  return (
    <div>
      <div className="top-bar">
        <h1>Resilience</h1>
        <p>
          Real dependency status via <code>GET /v1/resilience</code>, polled every 3s. Chaos controls
          actually stop/start the Redis container via podman.
        </p>
      </div>

      {error && <div className="deg" style={{ marginBottom: 16 }}>GET /v1/resilience failed: {error}</div>}

      {degraded && (
        <div className="deg" style={{ marginBottom: 16 }}>
          DEGRADED · a dependency is unreachable · rails-only decisioning · value capped at{" "}
          {data ? formatMinor(data.degradation_value_cap_minor) : "—"} · no BLOCK path active from any degraded
          path
        </div>
      )}

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="grid g2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {data && (
            <>
              <DepCard name="Redis" dep={data.dependencies.redis} />
              <DepCard name="Postgres" dep={data.dependencies.postgres} />
            </>
          )}
        </div>

        {data && (
          <div style={{ display: "flex", gap: 32, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div>
              <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                async shed total
              </span>
              <span className="fig num">{data.async_shed_total}</span>
            </div>
            <div>
              <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                async queue depth
              </span>
              <span className="fig num">{data.async_queue_depth}</span>
            </div>
            <div>
              <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                degradation value cap
              </span>
              <span className="fig num">{formatMinor(data.degradation_value_cap_minor)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="lbl" style={{ marginBottom: 12 }}>
          Chaos controls · POST /v1/admin/chaos/redis
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-danger" disabled={busy !== null} onClick={() => doChaos("kill")}>
            {busy === "kill" ? "Killing…" : "Kill Redis"}
          </button>
          <button className="btn btn-primary" disabled={busy !== null} onClick={() => doChaos("restore")}>
            {busy === "restore" ? "Restoring…" : "Restore Redis"}
          </button>
        </div>
        {actionResult && (
          <div className="lbl" style={{ marginTop: 10, color: "var(--ink-700)" }}>
            {actionResult}
          </div>
        )}
        {actionError && <div className="deg" style={{ marginTop: 10 }}>chaos action failed: {actionError}</div>}
      </div>
    </div>
  );
}

function DepCard({ name, dep }: { name: string; dep: { up: boolean; latency_ms: number; error?: string } }) {
  return (
    <div className="panel">
      <div className="lbl" style={{ marginBottom: 8 }}>
        {name}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          className="mono"
          style={{ fontSize: 12, fontWeight: 600, color: dep.up ? "var(--ink-900)" : "var(--ink-500)" }}
        >
          {dep.up ? "UP" : "DOWN"}
        </span>
        <span className="num" style={{ color: "var(--ink-500)" }}>
          {formatMs(dep.latency_ms)}
        </span>
      </div>
      {dep.error && (
        <div className="lbl" style={{ marginTop: 6, color: "var(--block)" }}>
          {dep.error}
        </div>
      )}
    </div>
  );
}
