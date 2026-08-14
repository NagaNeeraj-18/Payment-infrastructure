import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Decision, Finding, JudgeSessionResponse } from "../api/types";
import { formatMinor } from "../lib/format";

/** The judge-facing payer app (S0) — console-target-state.html's "Payer App" phone flow,
 * built for real: every screen here is driven by an actual POST /v1/decide call against the
 * live decision engine, not a scripted UI mock. "On rails" only means the two amounts/payees
 * are fixed rather than freely typed, so the same beat reproduces reliably for a live judge
 * demo — the decision itself is never predetermined; whatever the engine actually returns is
 * what renders. No SMS/OTP step is shown: this system has no real code-delivery
 * infrastructure, and claiming "we texted your phone" would be exactly the kind of demo lie
 * CLAUDE.md rules out. Also no "report a problem" or "case opened" affordance — no case
 * management backend exists behind those at P0, so they're left out rather than faked. */

type Step = "loading" | "error" | "pay" | "working" | "bait" | "interstitial" | "result";

const CHAI_AMOUNT_MINOR = 12000; // Rs 120 — small, ordinary, matches the merchant's own history
const SCAM_AMOUNT_MINOR = 300000; // Rs 3,000 — inside RAIL-102's step-up band, first-ever payee

// Plain-banking translations of the real fired findings/reason-codes this scenario is
// expected to surface — never invented text about a specific transaction; only used when the
// real decision actually fired that signal. Any FIRED finding not in this table still renders
// via the generic fallback so nothing is silently hidden.
const SIGNAL_COPY: Record<string, string> = {
  "rule:RAIL-102": "You've never sent money to this account before, and the amount is in the range scam collectors often ask for.",
  "rule:RF-001": "You've never sent money to this account before.",
  "rule:RF-002": "A lot of people paid this account very recently.",
  "rule:RF-003": "This is happening from a device we don't recognise on your account.",
  "rule:RF-004": "You added this recipient only moments ago.",
  "rule:RF-005": "This doesn't match your usual location.",
  model: "This pattern is unusual compared to how you normally pay.",
};

function humanFacts(findings: Finding[]): string[] {
  const fired = findings.filter((f) => f.status === "FIRED" && f.signal_id !== "novelty");
  const facts = fired.map((f) => SIGNAL_COPY[f.signal_id] ?? "One of our safety checks flagged this payment.");
  return Array.from(new Set(facts)).slice(0, 3);
}

function resultStyle(action: Decision["action"]): { headline: string; body: string; ok: boolean } {
  switch (action) {
    case "ALLOW":
    case "ALLOW_MONITOR":
      return { headline: "Payment sent", body: "Went through as an ordinary payment.", ok: true };
    case "STEP_UP":
    case "STEP_UP_INTERSTITIAL":
      return { headline: "Payment sent", body: "You chose to continue after the warning.", ok: true };
    default:
      return { headline: "Payment did not go through", body: `Held for review (${action}).`, ok: false };
  }
}

export function PayerApp() {
  const [step, setStep] = useState<Step>("loading");
  const [session, setSession] = useState<JudgeSessionResponse | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [amount, setAmount] = useState(0);
  const [payeeLabel, setPayeeLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    let cancelledEffect = false;
    api
      .judgeSession()
      .then((s) => {
        if (!cancelledEffect) {
          setSession(s);
          setStep("pay");
        }
      })
      .catch((e) => {
        if (!cancelledEffect) {
          setError(e instanceof Error ? e.message : String(e));
          setStep("error");
        }
      });
    return () => {
      cancelledEffect = true;
    };
  }, []);

  async function payChai() {
    if (!session) return;
    setStep("working");
    setError(null);
    try {
      const res = await api.decide({
        end_to_end_id: `${session.session_id}-chai-${Date.now()}`,
        rail: "UPI",
        debtor_account: session.payer_account,
        creditor_account: session.merchant_account,
        instructed_amount_minor: CHAI_AMOUNT_MINOR,
        initiation: "INTENT",
      });
      setDecision(res.decision);
      setAmount(CHAI_AMOUNT_MINOR);
      setPayeeLabel(session.merchant_label);
      if (res.decision.action === "ALLOW" || res.decision.action === "ALLOW_MONITOR") {
        setStep("bait");
      } else {
        setStep("interstitial");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("pay");
    }
  }

  async function payScam() {
    if (!session) return;
    setStep("working");
    setError(null);
    try {
      const res = await api.decide({
        end_to_end_id: `${session.session_id}-scam-${Date.now()}`,
        rail: "UPI",
        debtor_account: session.payer_account,
        creditor_account: session.scam_account,
        instructed_amount_minor: SCAM_AMOUNT_MINOR,
        initiation: "INTENT",
        remittance_info: "KYC verification fee",
      });
      setDecision(res.decision);
      setAmount(SCAM_AMOUNT_MINOR);
      setPayeeLabel(session.scam_label);
      if (res.decision.action === "ALLOW" || res.decision.action === "ALLOW_MONITOR") {
        setCancelled(false);
        setStep("result");
      } else {
        setStep("interstitial");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("bait");
    }
  }

  function goBack() {
    setCancelled(true);
    setStep("result");
  }

  function sendAnyway() {
    setCancelled(false);
    setStep("result");
  }

  return (
    <div className="payer">
      <div className="pbar">
        9:41
        <span className="sp" />
      </div>
      <div className="pbody">
        {step === "loading" && (
          <div className="pmid">
            <p>Setting up your test account…</p>
          </div>
        )}

        {step === "error" && (
          <div className="pmid">
            <div className="pok st">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </div>
            <h4>Couldn't reach Nazar</h4>
            <p>{error}</p>
          </div>
        )}

        {step === "pay" && session && (
          <>
            <div className="pnav">
              <b>Send money</b>
            </div>
            <div className="plab">Amount</div>
            <div className="pamt mny">{formatMinor(CHAI_AMOUNT_MINOR)}</div>
            <div className="pcard">
              <div className="rowx">
                <span className="avx">CP</span>
                <div>
                  <div className="nx">{session.merchant_label}</div>
                  <div className="sx">{session.merchant_account}</div>
                </div>
              </div>
            </div>
            {error && (
              <div className="deg" style={{ marginTop: 14 }}>
                {error}
              </div>
            )}
            <div className="psp" />
            <button className="pbtn pri" onClick={payChai}>
              Pay {formatMinor(CHAI_AMOUNT_MINOR)}
            </button>
          </>
        )}

        {step === "working" && (
          <div className="pmid">
            <p>Sending…</p>
          </div>
        )}

        {step === "bait" && session && (
          <>
            <div className="pnav">
              <b>Notifications</b>
            </div>
            <div className="pcard w">
              <div className="nx" style={{ marginBottom: 6 }}>
                KYC Verification Pending
              </div>
              <p style={{ fontSize: 13.5, color: "var(--ink2)", lineHeight: "20px" }}>
                Your account will be restricted unless you complete verification now. Pay a one-time fee to{" "}
                {session.scam_label} to keep your account active.
              </p>
            </div>
            <div className="psp" />
            <button className="pbtn dark" onClick={payScam}>
              Pay {formatMinor(SCAM_AMOUNT_MINOR)} verification fee
            </button>
            <button className="pbtn gh" onClick={() => setStep("result")}>
              Ignore
            </button>
          </>
        )}

        {step === "interstitial" && decision && (
          <>
            <div className="pnav">
              <b>Before you send</b>
            </div>
            <div className="pcard w pwarn">
              <div className="wico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 3l9 17H3z" />
                  <path d="M12 10v4M12 17h.01" />
                </svg>
              </div>
              <h4>Take a look before you send</h4>
              <p>
                {formatMinor(amount)} to {payeeLabel}. This account is new to us.
              </p>
              <div className="pfacts">
                {humanFacts(decision.findings ?? []).map((fact, i) => (
                  <div className="pfact" key={i}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v5M12 16h.01" />
                    </svg>
                    {fact}
                  </div>
                ))}
              </div>
            </div>
            <div className="psp" />
            <button className="pbtn dark" onClick={goBack}>
              Go back
            </button>
            <button className="pbtn gh" onClick={sendAnyway}>
              Send anyway
            </button>
          </>
        )}

        {step === "result" && (
          <div className="pmid">
            {cancelled ? (
              <>
                <div className="pok st">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </div>
                <h4>Payment cancelled</h4>
                <p>Nothing was sent to {payeeLabel}.</p>
              </>
            ) : decision ? (
              (() => {
                const r = resultStyle(decision.action);
                return (
                  <>
                    <div className={`pok ${r.ok ? "" : "st"}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        {r.ok ? <path d="M4 12.5l5 5 11-11" /> : <path d="M6 6l12 12M18 6L6 18" />}
                      </svg>
                    </div>
                    <h4>{r.headline}</h4>
                    <p>
                      {formatMinor(amount)} to {payeeLabel}
                      <br />
                      {r.body}
                      <br />
                      Reference <span className="mn">{decision.decision_seq}</span>
                    </p>
                  </>
                );
              })()
            ) : (
              <>
                <h4>Session ended</h4>
                <p>No notification was acted on.</p>
              </>
            )}
            <button
              className="pbtn dark"
              style={{ marginTop: 18 }}
              onClick={() => {
                setDecision(null);
                setCancelled(false);
                setStep("pay");
              }}
            >
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
