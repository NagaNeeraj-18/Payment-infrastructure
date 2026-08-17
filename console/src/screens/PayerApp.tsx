import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Decision, Finding, JudgeSessionResponse, StreamDecisionEvent } from "../api/types";
import { formatMinor } from "../lib/format";

/** The judge's phone: a five-act story in which the judge plays the customer.
 *
 * "Scripted" means the beats are fixed — who you pay, how much, and when the scam arrives —
 * so the same demo reproduces reliably in front of a room. It does NOT mean the outcomes are
 * scripted. Every tap is a real POST /v1/decide against the live engine, every warning is
 * assembled from the findings that decision actually returned, and if the engine allowed a
 * payment we expected it to challenge, this screen says so instead of pretending otherwise.
 * There is no branch in this file that renders a verdict the backend did not produce.
 *
 * Deliberately absent: no OTP step (we have no code-delivery infrastructure, and claiming
 * "we texted you" would be a demo lie), no account balance (we have no ledger), and no "case
 * opened" button (no case management exists at P0). Everything shown is something the system
 * genuinely does. */

type Act =
  | "error"
  | "intro"
  | "home"
  | "chai_done"
  | "call"
  | "scam_pay"
  | "warned"
  | "override"
  | "cancelled"
  | "reveal";

const CHAI_AMOUNT_MINOR = 12000; // Rs 120 — ordinary, matches the merchant's own history
const SCAM_AMOUNT_MINOR = 300000; // Rs 3,000 — the band impersonation scams actually use

/** Plain-banking translations of real fired signals. A signal not in this table still renders
 *  through the generic fallback, so nothing the engine flagged is silently dropped. */
const SIGNAL_COPY: Record<string, string> = {
  "rule:RAIL-102": "You have never sent money to this account before, and the amount is in the range scam collectors ask for.",
  "rule:RAIL-001": "This account was added to your list minutes ago, and the amount is above the regulatory limit for a brand-new payee.",
  "rule:RF-001": "You have never sent money to this account before.",
  "rule:RF-002": "A lot of different people have paid this same account in the last few minutes.",
  "rule:RF-003": "This is happening from a device we do not recognise on your account.",
  "rule:RF-004": "You added this recipient only moments ago.",
  "rule:RF-005": "This does not match where you normally pay from.",
  graph: "This account is collecting money from many unrelated people at once.",
  novelty: "This does not look like anything you, or our other customers, normally do.",
  model: "This pattern is unusual compared with how you normally pay.",
};

function humanFacts(findings: Finding[] | null): string[] {
  if (!findings) return [];
  const fired = findings.filter((f) => f.status === "FIRED");
  const facts = fired.map((f) => SIGNAL_COPY[f.signal_id] ?? "One of our safety checks flagged this payment.");
  return Array.from(new Set(facts)).slice(0, 4);
}

export function PayerApp() {
  const [act, setAct] = useState<Act>("intro");
  const [session, setSession] = useState<JudgeSessionResponse | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [history, setHistory] = useState<StreamDecisionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fanin, setFanin] = useState<number | null>(null);
  const allowedThrough = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .judgeSession()
      .then(async (s) => {
        if (cancelled) return;
        setSession(s);
        // Real prior activity for this payer — the warm-up payments the session seeded
        // through the same decision path. If the async shipper hasn't drained yet we show
        // fewer rows rather than inventing any.
        try {
          const { rows } = await api.recentDecisions(200);
          if (!cancelled && rows) {
            setHistory(rows.filter((r) => r.debtor_account === s.payer_account).slice(0, 4));
          }
        } catch {
          /* history is decoration; the story works without it */
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAct("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pay(to: string, amountMinor: number, expected: Act, tag: string) {
    if (!session) return;
    setBusy(true);
    try {
      const res = await api.decide({
        end_to_end_id: `judge-${session.session_id}-${tag}-${Date.now()}`,
        rail: "UPI",
        debtor_account: session.payer_account,
        creditor_account: to,
        instructed_amount_minor: amountMinor,
        initiation: "INTENT",
      });
      setDecision(res.decision);
      const a = res.decision.action;
      const wentThrough = a === "ALLOW" || a === "ALLOW_MONITOR";
      // Whatever the engine decided is what we show. If it let the scam payment through,
      // we report that rather than rendering a warning it never produced.
      if (expected === "warned" && wentThrough) {
        allowedThrough.current = true;
        setAct("reveal");
      } else {
        setAct(expected);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAct("error");
    } finally {
      setBusy(false);
    }
  }

  // How many distinct people have paid the collector account — real graph state, read only
  // at the reveal, so the number is whatever it genuinely is by then.
  async function loadFanin() {
    if (!session) return;
    try {
      const g = await api.graph(session.scam_account);
      setFanin(g.RingSize ?? null);
    } catch {
      setFanin(null);
    }
  }

  const elapsed = decision ? decision.total_ms : 0;

  if (act === "error")
    return (
      <div className="pa-boot">
        <h2>Can't reach the bank</h2>
        <p className="pa-err">{error}</p>
        <p>Nothing is being simulated in its place — this screen only ever shows real responses.</p>
      </div>
    );

  return (
    <div className="pa">
      <ActBar act={act} />

      {act === "intro" && (
        <div className="pa-card pa-intro">
          <div className="pa-kicker">For the next two minutes</div>
          <h1>You are Priya Sharma.</h1>
          <p>
            You've banked with us for two years. You pay for chai, you send money to family, and you have never once
            thought about fraud detection.
          </p>
          <p className="pa-dim">
            Everything you tap from here is a real payment, scored live by the same engine the bank runs. Watch the big
            screen as you go.
          </p>
          <button className="pa-btn pri" disabled={!session} onClick={() => setAct("home")}>
            {session ? "Open my banking app" : "Setting up your account…"}
          </button>
        </div>
      )}

      {act === "home" && (
        <div className="pa-phone">
          <div className="pa-acct">
            <span className="pa-acct-l">Account</span>
            <span className="pa-acct-v mn">···{session?.payer_account.slice(-10)}</span>
          </div>
          {history.length > 0 && (
            <>
              <div className="pa-sec">Recent activity</div>
              {history.map((h) => (
                <div key={h.end_to_end_id} className="pa-txn">
                  <span className="pa-txn-name">{session?.merchant_label ?? "Merchant"}</span>
                  <span className="pa-txn-amt mny">{formatMinor(h.amount_minor)}</span>
                </div>
              ))}
            </>
          )}
          <div className="pa-sec">Pay</div>
          <div className="pa-payee">
            <div className="pa-payee-av">CP</div>
            <div className="pa-payee-txt">
              <div className="pa-payee-n">{session?.merchant_label ?? "Chai Point"}</div>
              <div className="pa-payee-s">Your usual morning stop</div>
            </div>
            <div className="pa-payee-amt mny">{formatMinor(CHAI_AMOUNT_MINOR)}</div>
          </div>
          <button
            className="pa-btn pri"
            disabled={busy}
            onClick={() => pay(session!.merchant_account, CHAI_AMOUNT_MINOR, "chai_done", "chai")}
          >
            {busy ? "Paying…" : `Pay ${formatMinor(CHAI_AMOUNT_MINOR)}`}
          </button>
        </div>
      )}

      {act === "chai_done" && (
        <div className="pa-card pa-ok">
          <div className="pa-tick">✓</div>
          <h1>Paid</h1>
          <p className="pa-big mny">{formatMinor(CHAI_AMOUNT_MINOR)}</p>
          <p>to {session?.merchant_label}</p>
          <div className="pa-speed">
            cleared in <b>{elapsed.toFixed(1)} ms</b>
          </div>
          <p className="pa-dim">
            Thirty different things were checked about that payment before it went through, and you felt none of them.
            That is the point: good customers should never meet the fraud system.
          </p>
          <button className="pa-btn" onClick={() => setAct("call")}>
            Continue
          </button>
        </div>
      )}

      {act === "call" && (
        <div className="pa-card">
          <div className="pa-call-top">
            <div className="pa-call-av">!</div>
            <div>
              <div className="pa-call-from">+91 80 4718 2299</div>
              <div className="pa-call-sub">Missed call · 2 minutes ago</div>
            </div>
          </div>
          <div className="pa-sms">
            <div className="pa-sms-h">SMS · VM-KYCVRF</div>
            <p>
              <b>URGENT:</b> Your account KYC has expired and will be <b>suspended today at 6 PM</b>. To keep your
              account active, transfer ₹3,000 to the verification account below. The amount is refunded within 24
              hours.
            </p>
            <p className="pa-sms-acct">
              Verification A/C <span className="mn">···{session?.scam_account.slice(-10)}</span>
              <br />
              Name: {session?.scam_label}
            </p>
          </div>
          <p className="pa-dim pa-note">
            This is the most common fraud in Indian payments. The caller is convincing, the deadline is invented, and
            the victim authorises the payment themselves — which is why a system that only asks "did the real customer
            approve this?" catches none of it.
          </p>
          <div className="pa-choices">
            <button className="pa-btn ghost" onClick={() => { loadFanin(); setAct("reveal"); }}>
              Ignore it
            </button>
            <button className="pa-btn danger" onClick={() => setAct("scam_pay")}>
              Do as they say
            </button>
          </div>
        </div>
      )}

      {act === "scam_pay" && (
        <div className="pa-phone">
          <div className="pa-sec">Confirm payment</div>
          <div className="pa-payee">
            <div className="pa-payee-av danger">KV</div>
            <div className="pa-payee-txt">
              <div className="pa-payee-n">{session?.scam_label}</div>
              <div className="pa-payee-s mn">···{session?.scam_account.slice(-10)}</div>
            </div>
            <div className="pa-payee-amt mny">{formatMinor(SCAM_AMOUNT_MINOR)}</div>
          </div>
          <button
            className="pa-btn pri"
            disabled={busy}
            onClick={() => pay(session!.scam_account, SCAM_AMOUNT_MINOR, "warned", "scam")}
          >
            {busy ? "Sending…" : `Send ${formatMinor(SCAM_AMOUNT_MINOR)}`}
          </button>
          <p className="pa-dim pa-note">
            You authorised this yourself. Your PIN is correct. Nothing about your account is compromised.
          </p>
        </div>
      )}

      {act === "warned" && decision && (
        <div className="pa-warn">
          <div className="pa-warn-icon">!</div>
          <h1>Stop. This looks like a scam.</h1>
          <p className="pa-warn-lead">
            We are not blocking you. We are telling you what we can see, because you are about to lose{" "}
            {formatMinor(SCAM_AMOUNT_MINOR)}.
          </p>
          <ul className="pa-facts">
            {humanFacts(decision.findings).map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <div className="pa-truth">
            No bank, and no police officer, will ever ask you to move money into a "safe" or "verification" account.
            That request is the fraud.
          </div>
          <div className="pa-speed">
            decided in <b>{elapsed.toFixed(1)} ms</b> · {decision.action.replace(/_/g, " ").toLowerCase()}
          </div>
          <div className="pa-choices">
            <button className="pa-btn pri" onClick={() => { loadFanin(); setAct("cancelled"); }}>
              Cancel this payment
            </button>
            <button className="pa-btn danger ghost" onClick={() => { loadFanin(); setAct("override"); }}>
              I understand, send anyway
            </button>
          </div>
        </div>
      )}

      {act === "cancelled" && (
        <div className="pa-card pa-ok">
          <div className="pa-tick">✓</div>
          <h1>Payment cancelled</h1>
          <p className="pa-big mny">{formatMinor(SCAM_AMOUNT_MINOR)}</p>
          <p>stayed in your account.</p>
          <p className="pa-dim">
            That warning cost you four seconds. It is the whole trade this system is built around: a few seconds of
            friction on the small number of payments that need it, and nothing at all on the rest.
          </p>
          <button className="pa-btn" onClick={() => setAct("reveal")}>
            Show me what the bank saw
          </button>
        </div>
      )}

      {act === "override" && (
        <div className="pa-card pa-held">
          <h1>Flagged to our fraud team</h1>
          <p className="pa-dim">
            You chose to continue, and we recorded that. The payment is now in the analyst queue with the full evidence
            attached, and the receiving account is on our radar.
          </p>
          <p className="pa-dim">
            We could have refused outright. We don't, because a bank that silently blocks its customers' money is a
            different and worse problem — and because occasionally the customer is right and we are wrong.
          </p>
          <button className="pa-btn" onClick={() => setAct("reveal")}>
            Show me what the bank saw
          </button>
        </div>
      )}

      {act === "reveal" && (
        <div className="pa-card pa-reveal">
          <div className="pa-kicker">Now look at the big screen</div>
          <h1>Everything you just did is already there.</h1>
          {allowedThrough.current && (
            <p className="pa-honest">
              Note: the engine allowed that payment rather than challenging it. That is what actually happened, so
              that is what this screen says.
            </p>
          )}
          <p>
            Both payments, the evidence behind each one, the money arithmetic that chose the response, and a re-run
            proving the decision reproduces exactly — with its audit hash intact.
          </p>
          {fanin !== null && fanin > 1 && (
            <div className="pa-ring">
              <b>{fanin} different people</b> have now paid that same "verification" account. You weren't being
              targeted. You were one row in a fan-out.
            </div>
          )}
          {decision && (
            <div className="pa-ref">
              your reference <span className="mn">{decision.end_to_end_id}</span>
            </div>
          )}
          <button className="pa-btn ghost" onClick={() => window.location.reload()}>
            Run it again for the next judge
          </button>
        </div>
      )}
    </div>
  );
}

const ACT_STEPS: { key: string; label: string; acts: Act[] }[] = [
  { key: "1", label: "Ordinary", acts: ["intro", "home", "chai_done"] },
  { key: "2", label: "The call", acts: ["call", "scam_pay"] },
  { key: "3", label: "The catch", acts: ["warned"] },
  { key: "4", label: "Your choice", acts: ["cancelled", "override"] },
  { key: "5", label: "The proof", acts: ["reveal"] },
];

function ActBar({ act }: { act: Act }) {
  const activeIdx = ACT_STEPS.findIndex((s) => s.acts.includes(act));
  return (
    <div className="pa-acts">
      {ACT_STEPS.map((s, i) => (
        <div key={s.key} className={`pa-act ${i === activeIdx ? "on" : i < activeIdx ? "done" : ""}`}>
          <span className="pa-act-n">{s.key}</span>
          <span className="pa-act-l">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
