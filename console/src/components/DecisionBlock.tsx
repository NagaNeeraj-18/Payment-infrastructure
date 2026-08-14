import { Fragment } from "react";
import { LADDER, type Action } from "../api/types";

interface DecisionBlockProps {
  action: Action;
  /** policy.Ladder.AdvisoryMaxRung — reads from the decision's context, not hardcoded.
   *  Falls back to "STEP_UP_INTERSTITIAL" (the only value the policy has ever shipped)
   *  only when the caller has no policy loaded yet. */
  advisoryMaxRung?: string;
  caption?: string;
}

/** The signature component (docs/08 §3). All five rungs always render; CAP/BLOCK render
 * detached below a rule since they are off-ladder and never take a risk hue. */
export function DecisionBlock({ action, advisoryMaxRung = "STEP_UP_INTERSTITIAL", caption }: DecisionBlockProps) {
  const isOffLadder = action === "CAP" || action === "BLOCK";
  const ceilIndex = LADDER.indexOf(advisoryMaxRung as Action);

  return (
    <div className="dblock">
      {caption && <div className="top-l">{caption}</div>}
      <h3>{action}</h3>
      {LADDER.map((rung, i) => (
        <Fragment key={rung}>
          <div className={`rung ${!isOffLadder && rung === action ? "on" : ""}`}>
            <span className="pip" />
            {rung}
          </div>
          {ceilIndex >= 0 && i === ceilIndex && <div className="ceil">advisory ceiling</div>}
        </Fragment>
      ))}
      <div className="offl">
        <span className={action === "CAP" ? "active" : ""}>⌐ CAP</span>
        <span className={action === "BLOCK" ? "active" : ""}>⊘ BLOCK</span>
      </div>
    </div>
  );
}
