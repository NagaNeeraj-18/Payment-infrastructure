# 08 — Brand Kit

**Binding on all UI.** Reference points: Unit21 and Sardine (risk console), Increase and Modern
Treasury (density and restraint), Mercury (editorial display), Ramp (solid colour blocks).

**Direction — "Clearing House."** Near-white paper, extreme density, monospace data, and one
saturated ultramarine used as solid blocks rather than tint. Status colour appears *only* on risk
state. The console is light, not dark — that is the category norm and it survives a projector.

Two surfaces:

| | **Payer app** (S0) | **Console** (S1–S7) |
|---|---|---|
| Ground | Warm paper | Cool paper |
| Type | Zodiak display + Switzer | Spline Sans Mono, everywhere |
| Radius | 12 px | 2 px |
| Row | Generous | 26 px |
| Voice | Human banking | Engineering |

---

## 1 — Type

Three faces. **No Inter, no Plex, no Space Grotesk.**

```html
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&f[]=zodiak@400,500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spline+Sans+Mono:wght@400;500;600&display=swap">
```

```css
--font-mono:    "Spline Sans Mono", ui-monospace, SFMono-Regular, monospace;
--font-ui:      "Switzer", ui-sans-serif, system-ui, -apple-system, sans-serif;
--font-display: "Zodiak", Georgia, serif;
```

| Face | Role |
|---|---|
| **Spline Sans Mono** | Every numeral, table cell, ID, hash, timestamp, chip, label, eyebrow. The console is ~80 % this face |
| **Switzer** | Buttons, narrative prose, payer app body |
| **Zodiak** | Display only — the headline figure, the payer headline, section numerals. Never below 20 px |

Scale:

```css
--t-micro:  10px/14px;   /* chips, footer      mono, ucase, .09em */
--t-label:  11px/15px;   /* eyebrows           mono, ucase, .07em */
--t-cell:   12px/16px;   /* table              mono, tabular      */
--t-body:   13px/20px;   /* prose              ui                 */
--t-lead:   15px/22px;   /* alert headline     ui, 500            */
--t-figure: 24px/28px;   /* strip metric       mono, 500          */
--t-hero:   44px/46px;   /* value prevented    display            */
--t-amount: 38px/42px;   /* payer amount       mono, 500          */
```

```css
* { font-variant-numeric: tabular-nums; }
.num { font-feature-settings: "tnum" 1, "zero" 1; }
```

Slashed zero on everything numeric — `0` and `O` sit next to each other in hash columns.

---

## 2 — Colour

### Paper and ink

```css
--canvas:      #F6F6F4;   /* app background        */
--panel:       #FFFFFF;   /* cards, tables         */
--sunken:      #EFEFEC;   /* wells, inputs, hover  */
--line:        #E2E2DE;   /* hairline              */
--line-strong: #C6C6C0;   /* section rule          */

--ink-900: #111310;   /* primary   */
--ink-700: #3E413C;   /* secondary */
--ink-500: #6C706A;   /* labels    */
--ink-300: #A0A49D;   /* disabled  */
```

Payer app runs one notch warmer: `--paper: #FBFAF7`, `--paper-sunken: #F3F1EC`.

### Ultramarine — structure, not tint

```css
--ultra-600: #16289B;
--ultra-500: #1F35B5;   /* solid blocks, primary action */
--ultra-400: #3D53DA;   /* hover                        */
--ultra-wash:#EAECFB;   /* selection only               */
```

Used as **solid fills on large surfaces** — the decision block, the primary button, the active nav
rail. Not as a 10 % background tint behind text. If it appears as a pale wash anywhere except
selection, it is wrong.

### Risk — reserved

```css
--allow:  #17795A;
--stepup: #9A6410;
--hold:   #8A3D14;
--block:  #A82434;
```

Each has a 12 %-alpha fill for chip backgrounds. `ALLOW_MONITOR` is `--allow` outlined, not a new
colour. **`CAP` is off-ladder and renders in `--ink-700` with a `⌐` glyph** — never a risk hue.
Degradation renders in `--ink-500`, never red.

### Not used

Gradients · glassmorphism · drop shadows (hairlines only) · cyan · violet · dark mode · a green
success badge on an allowed payment · emoji · spinners.

---

## 3 — Signature: the decision block

The one saturated surface in the product. Solid ultramarine, white type, sits at the head of S2 and
in the case queue detail.

```
┌──────────────────────────────┐
│  STEP_UP_INTERSTITIAL        │   ← 15px mono, 600, white
│                              │
│  ALLOW              ·        │
│  ALLOW_MONITOR      ·        │
│  STEP_UP            ·        │
│  STEP_UP_INTERSTITIAL  ●     │
│  ─ ─ ─ advisory ceiling ─ ─  │
│  HOLD               ·        │
│                              │
│  ⌐ CAP        ⊘ BLOCK        │   ← detached, below rule
└──────────────────────────────┘
```

All five rungs always render. The dashed ceiling reads `policy.advisory_max_rung` from the decision
record. `CAP` and `BLOCK` sit below a rule because they are not rungs.

---

## 4 — Four-state chips

Shape first, colour second — they must survive greyscale.

| State | Glyph | Treatment |
|---|---|---|
| `CLEAR` | `✓` | 1 px `--line-strong`, no fill, `--ink-700` |
| `FIRED` | `▲` | 1 px `--stepup`, 12 % fill, `--stepup` |
| `NOT_APPLICABLE` | `—` | 1 px **dashed** `--line`, `--ink-300` |
| `NOT_EVALUATED` | `○` | **4 px diagonal hatch**, 1 px `--line-strong`, `--ink-500` |

`NOT_EVALUATED` always shows its reason (`cold_start`, `stale`, `off_scale`). Radius 3 px, not pill.

---

## 5 — Density and geometry

```css
--r-console: 2px;   --r-payer: 12px;   --r-chip: 3px;
--row: 26px;        --row-lg: 32px;
/* spacing: 4 8 12 16 24 32 48 */
```

Tables: 1 px `--line` bottom rule per row, no zebra, `--sunken` on hover. Panels: 1 px `--line`, no
shadow. Left nav rail 52 px, active item a solid ultramarine block.

Motion: new row flashes a 2 px ultramarine left edge for 400 ms — no slide, no layout shift.
Confirm-fraud fires four staggered fades, 180 ms each, 60 ms apart. Nothing else animates.
`prefers-reduced-motion` kills all of it.

---

## 6 — Numbers and copy

```ts
// ₹4,25,000.00 — en-IN grouping from int64 paise, formatted at the render boundary only
new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100)
// strip figures: ₹4.2L, ₹1.3Cr — lakh/crore, never K/M
```

Latency always renders as three figures (`queue / service / total`), total emphasised. A lone
latency number is a bug. Hashes truncate mid: `a3f1…9e2b`, click to copy.

| Never | Always |
|---|---|
| "This account was created 3 days ago" | "We first saw this account 3 days ago" |
| "Verified" / "Safe" / green tick | Console `ALLOWED`; payer app, nothing |
| "Advisory escalation" (payer) | "Take a look before you send" |
| "94% of fraud detected" | "Recovers 94% of generated mule fan-out" |

Payer surfaces carry **zero** engineering vocabulary. Buttons name their consequence and keep the
name: `Confirm fraud` → `Confirmed`.

---

## 7 — Handover

Paste §1, §2, §5 into `console/src/styles/tokens.css`. No hex literal outside that file.

**Tailwind v4:**

```css
@theme {
  --color-canvas: var(--canvas);
  --color-panel:  var(--panel);
  --color-line:   var(--line);
  --color-ink-900:var(--ink-900);
  --color-ultra:  var(--ultra-500);
  --color-allow:  var(--allow);
  --color-stepup: var(--stepup);
  --color-hold:   var(--hold);
  --color-block:  var(--block);
  --font-mono:    "Spline Sans Mono", monospace;
  --font-ui:      "Switzer", system-ui, sans-serif;
  --font-display: "Zodiak", Georgia, serif;
  --radius-console: 2px;
}
```

**Build order:** tokens → `<DecisionBlock>` + `<StateChip>` → S2 alert detail → S1 → payer app →
S3–S7 with no new decisions.

**Done when:** no hex outside tokens · all four chip states distinct in greyscale · every numeral
tabular and slot-width fixed · no lone latency figure · no spinner · money `en-IN` from paise ·
reduced-motion honoured · payer app free of engineering words · no green success state.

---

**Back to:** [07-PRESENTATION-ARCHITECTURE.md](07-PRESENTATION-ARCHITECTURE.md)
