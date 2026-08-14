// Thin fetch client for the real Nazar Go backend. No mocking, no fallback data — every
// function either resolves with real backend JSON or throws, and callers render the error.
import type {
  AuditVerifyResponse,
  CalibrationResponse,
  ChaosResponse,
  DecisionDetailResponse,
  DecisionResponse,
  DemoRunResponse,
  DemoScenario,
  GraphResponse,
  HealthzResponse,
  JudgeSessionResponse,
  LatencyResponse,
  PolicyBundle,
  RecentDecisionsResponse,
  ResilienceResponse,
} from "./types";

// Resolves to whatever host served this page, port 8080 — so a phone on the same network as
// the console (e.g. scanning the judge-demo QR) reaches the real backend without hardcoding
// "localhost", which only ever means the phone itself. Falls back to localhost for anything
// not served over http/https (e.g. a file:// preview).
export const API_BASE = (() => {
  if (typeof window === "undefined" || !window.location.hostname) return "http://localhost:8080";
  const proto = window.location.protocol === "https:" ? "https:" : "http:";
  return `${proto}//${window.location.hostname}:8080`;
})();

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`POST ${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  healthz: () => getJSON<HealthzResponse>("/healthz"),
  decide: (event: unknown) => postJSON<DecisionResponse>("/v1/decide", event),
  getDecision: (endToEndId: string) =>
    getJSON<DecisionDetailResponse>(`/v1/decisions/${encodeURIComponent(endToEndId)}`),
  latency: () => getJSON<LatencyResponse>("/v1/latency"),
  resilience: () => getJSON<ResilienceResponse>("/v1/resilience"),
  auditVerify: () => getJSON<AuditVerifyResponse>("/v1/audit/verify"),
  chaosRedis: (action: "kill" | "restore") =>
    postJSON<ChaosResponse>("/v1/admin/chaos/redis", { action }),
  graph: (account: string) => getJSON<GraphResponse>(`/v1/graph/${encodeURIComponent(account)}`),
  policy: () => getJSON<PolicyBundle>("/v1/policy"),
  calibration: () => getJSON<CalibrationResponse>("/v1/calibration"),
  runDemo: (scenario: DemoScenario) =>
    postJSON<DemoRunResponse>(`/v1/demo/run/${scenario}`),
  recentDecisions: (limit = 100) =>
    getJSON<RecentDecisionsResponse>(`/v1/decisions/recent?limit=${limit}`),
  judgeSession: () => postJSON<JudgeSessionResponse>("/v1/judge/session"),
  streamUrl: () => `${API_BASE}/v1/stream`,
};
