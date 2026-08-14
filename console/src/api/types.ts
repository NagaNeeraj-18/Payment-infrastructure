// Wire types mirroring go/internal/contract/*.go. snake_case throughout — this IS the API
// contract (see decision.go's own comment). Do not rename fields to camelCase; the whole
// point is that this file stays a faithful mirror of the Go structs.

export type Action =
  | "ALLOW"
  | "ALLOW_MONITOR"
  | "STEP_UP"
  | "STEP_UP_INTERSTITIAL"
  | "HOLD"
  | "CAP"
  | "BLOCK";

export const LADDER: Action[] = [
  "ALLOW",
  "ALLOW_MONITOR",
  "STEP_UP",
  "STEP_UP_INTERSTITIAL",
  "HOLD",
];

export type DecisionKind = "LIVE" | "SHADOW" | "REPLAY" | "RESOLUTION" | "CONTROL";

// Four-state chip status — contract/status.go.
export type Status = "CLEAR" | "FIRED" | "NOT_APPLICABLE" | "NOT_EVALUATED";

export interface FeatureVector {
  values: Record<string, number | null>;
  status: Record<string, Status>;
  reason: Record<string, string>;
  staleness: Record<string, number>;
}

export interface Finding {
  signal_id: string;
  status: Status;
  score: number;
  explanation: string;
  provenance: string;
  latency_ms: number;
  version: string;
  reason_code: string;
}

export interface Decision {
  end_to_end_id: string;
  decision_seq: number;
  kind: DecisionKind;
  decided_at_ms: number;
  accepted_at_ms: number;

  action: Action;
  pre_advisory_action: Action;
  rail_fired: string;
  reason_codes: string[] | null;

  p_model: number | null;
  p_prevalence_adj: number | null;
  expected_loss_minor: number | null;
  expected_cost_minor: number | null;

  features: FeatureVector | null;
  findings: Finding[] | null;
  contributions: Record<string, number> | null;

  model_bundle_version: string;
  policy_version: string;
  rules_version: string;
  signal_registry_version: string;

  is_control: boolean;
  action_propensity: number;

  degraded: string[] | null;

  total_ms: number;
  queue_delay_ms: number;
  service_ms: number;

  decision_shard: number;
  chain_seq: number;
  prev_hash: string | null; // base64
  hash: string; // base64
  checkpoint_id: number | null;
}

export interface DecisionResponse {
  decision: Decision;
  replayed: boolean;
}

// Raw canonical event fields, as persisted alongside the decision.
export interface TransactionRecord {
  end_to_end_id?: string;
  event_ts_ms?: number;
  accepted_at_ms?: number;
  rail?: string;
  channel?: string;
  bank_instance?: string;
  debtor_account?: string;
  debtor_vpa?: string;
  creditor_account?: string;
  creditor_vpa?: string;
  creditor_ifsc?: string;
  instructed_amount_minor?: number;
  currency?: string;
  device_id?: string;
  ip?: string;
  asn?: number;
  geo_cell?: string;
  session_id?: string;
  app_version?: string;
  initiation?: string;
  remittance_info?: string;
  schema_version?: number;
  [key: string]: unknown;
}

export interface DecisionDetailResponse {
  decision: Decision;
  transaction: TransactionRecord;
}

export interface DependencyHealth {
  up: boolean;
  latency_ms: number;
  error?: string;
}

export interface HealthzResponse {
  up: boolean;
  non_degraded: boolean;
  dependencies: {
    redis: DependencyHealth;
    postgres: DependencyHealth;
  };
}

export interface LatencyResponse {
  n: number;
  p50: number;
  p90: number;
  p99: number;
  p999: number;
  max: number;
}

export interface ResilienceResponse {
  dependencies: {
    redis: DependencyHealth;
    postgres: DependencyHealth;
  };
  async_shed_total: number;
  async_queue_depth: number;
  degradation_value_cap_minor: number;
}

export interface AuditVerifyResponse {
  ok: boolean;
  n: number;
  break_at: number;
}

export interface ChaosResponse {
  action: string;
  container: string;
}

export interface GraphResponse {
  RingScore: number;
  RingSize: number;
  ComponentBankCount: number;
  HopsToCashout: number;
  DeviceSharedDegree: number;
}

// Policy bundle — shape kept loose (PascalCase per the Go json defaults for this endpoint);
// rendered mostly as raw JSON on the governance view rather than fully typed field by field.
export type PolicyBundle = Record<string, unknown>;

export interface CalibrationResponse {
  calibrator_method: string;
  calibrator_version: string;
  model_bundle: string;
  prevalence: {
    version: string;
    train_prevalence: number;
    natural_prevalence: number;
  };
  score_distribution: {
    n: number;
    buckets: string[];
    counts: number[];
  };
  reliability_diagram_available: boolean;
  reliability_diagram_note: string;
}

// SSE payload on `event: decision` from /v1/stream.
export interface StreamDecisionEvent {
  end_to_end_id: string;
  decided_at_ms: number;
  debtor_account: string;
  creditor_account: string;
  amount_minor: number;
  rail: string;
  action: Action;
  total_ms: number;
  degraded: string[] | null;
}

// POST /v1/judge/session — seeds a fresh real payer with real warm-up history (via the same
// DecideAndPersist path everything else uses), for the judge-facing Payer App.
export interface JudgeSessionResponse {
  session_id: string;
  payer_account: string;
  merchant_account: string;
  merchant_label: string;
  scam_account: string;
  scam_label: string;
}

// GET /v1/decisions/recent — real persisted history (Postgres), same shape as the SSE
// stream row, used to hydrate Live Monitor on load rather than leaving it empty until the
// next decision happens to fire after the tab connects.
export interface RecentDecisionsResponse {
  rows: StreamDecisionEvent[] | null;
}

export type DemoScenario = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface DemoStep {
  label: string;
  event?: unknown;
  decision?: Decision;
  note?: string;
}

export interface DemoRunResponse {
  scenario: DemoScenario;
  expected: string;
  steps: DemoStep[];
  passed: boolean;
}
