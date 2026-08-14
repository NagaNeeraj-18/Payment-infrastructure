import { useState } from "react";
import { api } from "../api/client";
import type { AuditVerifyResponse } from "../api/types";

export function AuditChain() {
  const [result, setResult] = useState<AuditVerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.auditVerify();
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="top-bar">
        <h1>Audit Chain</h1>
        <p>
          One chain, one writer (P0 — CLAUDE.md). <code>GET /v1/audit/verify</code> recomputes the hash
          chain live and reports the first break, if any.
        </p>
      </div>

      <div className="panel">
        <button className="btn btn-primary" onClick={verify} disabled={loading}>
          {loading ? "Verifying…" : "Verify Chain"}
        </button>

        {error && <div className="deg" style={{ marginTop: 16 }}>GET /v1/audit/verify failed: {error}</div>}

        {result && (
          <div style={{ display: "flex", gap: 40, marginTop: 20 }}>
            <div>
              <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                result
              </span>
              <span
                className="fig num"
                style={{ color: result.ok ? "var(--ink-900)" : "var(--block)" }}
              >
                {result.ok ? "INTACT" : "BROKEN"}
              </span>
            </div>
            <div>
              <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                decisions checked (n)
              </span>
              <span className="fig num">{result.n}</span>
            </div>
            <div>
              <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
                break at
              </span>
              <span className="fig num">{result.break_at === -1 ? "none" : result.break_at}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
