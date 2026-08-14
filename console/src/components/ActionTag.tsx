import type { Action } from "../api/types";

/** action -> {css class, display label}. CAP/BLOCK are off-ladder: glyph, --ink-700, never
 * a risk hue (brand kit §2, §3). ALLOW_MONITOR is --allow outlined, not a new colour —
 * approximated here by sharing the allow class since we don't have a distinct outline mode
 * in the compact table cell. */
function tagFor(action: Action): { cls: string; label: string } {
  switch (action) {
    case "ALLOW":
      return { cls: "a-allow", label: "allowed" };
    case "ALLOW_MONITOR":
      return { cls: "a-allow", label: "allow_monitor" };
    case "STEP_UP":
      return { cls: "a-stepup", label: "step_up" };
    case "STEP_UP_INTERSTITIAL":
      return { cls: "a-stepup", label: "step_up_interstitial" };
    case "HOLD":
      return { cls: "a-hold", label: "hold" };
    case "CAP":
      return { cls: "a-off", label: "⌐ cap" };
    case "BLOCK":
      return { cls: "a-off", label: "⊘ blocked" };
    default:
      return { cls: "a-off", label: String(action).toLowerCase() };
  }
}

export function ActionTag({ action }: { action: Action }) {
  const { cls, label } = tagFor(action);
  return <span className={`act ${cls}`}>{label}</span>;
}
