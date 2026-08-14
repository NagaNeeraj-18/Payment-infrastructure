import type { Status } from "../api/types";

const GLYPH: Record<Status, string> = {
  CLEAR: "✓",
  FIRED: "▲",
  NOT_APPLICABLE: "—",
  NOT_EVALUATED: "○",
};

const CLASS: Record<Status, string> = {
  CLEAR: "chip c-clear",
  FIRED: "chip c-fired",
  NOT_APPLICABLE: "chip c-na",
  NOT_EVALUATED: "chip c-ne",
};

interface StateChipProps {
  label: string;
  status: Status;
  /** Reason shown for NOT_APPLICABLE / NOT_EVALUATED, e.g. "cold_start", "stale". */
  reason?: string | null;
}

/** Four-state signal/feature chip — docs/08 §4. Shape distinguishes state, not just colour. */
export function StateChip({ label, status, reason }: StateChipProps) {
  const showReason = (status === "NOT_APPLICABLE" || status === "NOT_EVALUATED") && reason;
  return (
    <span className={CLASS[status]} title={status}>
      {GLYPH[status]} {label}
      {showReason && <u>· {reason}</u>}
    </span>
  );
}
