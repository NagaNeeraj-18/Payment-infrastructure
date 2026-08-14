import { useState } from "react";
import { api } from "../api/client";
import type { GraphResponse } from "../api/types";

export function GraphView() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<GraphResponse | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!input) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.graph(input);
      setData(res);
      setAccount(input);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="top-bar">
        <h1>Graph / Ring</h1>
        <p>
          Account lookup against <code>GET /v1/graph/&#123;account&#125;</code> — in-process Go adjacency
          with decay and component cap (P0).
        </p>
      </div>

      <form onSubmit={lookup} className="panel" style={{ marginBottom: 20, display: "flex", gap: 10 }}>
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="account id"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && <div className="deg">GET /v1/graph/{input} failed: {error}</div>}

      {data && account && (
        <div className="panel">
          <div className="lbl" style={{ marginBottom: 14 }}>
            {account}
          </div>
          <div className="grid g4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
            <Metric label="ring score" value={data.RingScore.toFixed(4)} />
            <Metric label="ring size" value={String(data.RingSize)} />
            <Metric label="component bank count" value={String(data.ComponentBankCount)} />
            <Metric label="hops to cashout" value={String(data.HopsToCashout)} />
            <Metric label="device shared degree" value={String(data.DeviceSharedDegree)} />
          </div>
          {data.RingScore === 0 && (
            <div className="lbl" style={{ marginTop: 16, color: "var(--ink-300)" }}>
              ring_score 0 — the graph layer does not flag this account. Rings and novelty never block
              on their own (CLAUDE.md non-negotiable #7).
            </div>
          )}
        </div>
      )}

      {!data && !error && !loading && (
        <div className="lbl">No account looked up yet.</div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </span>
      <span className="fig num">{value}</span>
    </div>
  );
}
