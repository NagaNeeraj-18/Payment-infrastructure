import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CalibrationResponse } from "../api/types";

export function Calibration() {
  const [data, setData] = useState<CalibrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .calibration()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <div className="top-bar">
        <h1>Calibration</h1>
        <p>Real calibrator metadata and score distribution via <code>GET /v1/calibration</code>.</p>
      </div>

      {error && <div className="deg">GET /v1/calibration failed: {error}</div>}
      {!data && !error && <div className="lbl">Loading…</div>}

      {data && (
        <>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              <Field label="calibrator method" value={data.calibrator_method} />
              <Field label="calibrator version" value={data.calibrator_version} />
              <Field label="model bundle" value={data.model_bundle} />
              <Field label="prevalence version" value={data.prevalence.version} />
              <Field label="train prevalence" value={data.prevalence.train_prevalence.toFixed(4)} />
              <Field label="natural prevalence" value={data.prevalence.natural_prevalence.toFixed(4)} />
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="lbl" style={{ marginBottom: 14 }}>
              Score distribution (n={data.score_distribution.n})
            </div>
            <ScoreHistogram buckets={data.score_distribution.buckets} counts={data.score_distribution.counts} />
          </div>

          <div className="panel">
            <div className="lbl" style={{ marginBottom: 10 }}>
              Reliability diagram
            </div>
            {data.reliability_diagram_available ? (
              <div className="lbl">available — not yet rendered in this build</div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: "20px" }}>
                {data.reliability_diagram_note}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="lbl" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </span>
      <span className="mono num" style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}

function ScoreHistogram({ buckets, counts }: { buckets: string[]; counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 40px", gap: "6px 12px", alignItems: "center" }}>
      {buckets.map((b, i) => (
        <div key={b} style={{ display: "contents" }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-500)" }}>
            {b}
          </span>
          <div style={{ height: 14, background: "var(--sunken)", position: "relative" }}>
            <div
              style={{
                height: "100%",
                width: `${(counts[i] / max) * 100}%`,
                background: "var(--ultra-500)",
              }}
            />
          </div>
          <span className="mono num" style={{ fontSize: 11, textAlign: "right" }}>
            {counts[i]}
          </span>
        </div>
      ))}
    </div>
  );
}
