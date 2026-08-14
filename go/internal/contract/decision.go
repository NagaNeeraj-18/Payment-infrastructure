package contract

// Action is a rung on the decision ladder plus the two off-ladder actions (docs/04 §5).
type Action string

const (
	ActionAllow               Action = "ALLOW"
	ActionAllowMonitor        Action = "ALLOW_MONITOR"
	ActionStepUp              Action = "STEP_UP"
	ActionStepUpInterstitial  Action = "STEP_UP_INTERSTITIAL"
	ActionHold                Action = "HOLD"
	ActionBlock               Action = "BLOCK" // local blocklist only, or CAP-class regulatory rail
	ActionCap                 Action = "CAP"   // off-ladder — docs/04 §5
)

// Ladder is the ordered rung sequence used by the advisory attach step. Advisories may
// never push past AdvisoryMaxRung (STEP_UP_INTERSTITIAL) — F-20.
var Ladder = []Action{ActionAllow, ActionAllowMonitor, ActionStepUp, ActionStepUpInterstitial, ActionHold}

func LadderIndex(a Action) int {
	for i, x := range Ladder {
		if x == a {
			return i
		}
	}
	return -1
}

// DecisionKind mirrors the Postgres enum (docs/02 §7).
type DecisionKind string

const (
	KindLive       DecisionKind = "LIVE"
	KindShadow     DecisionKind = "SHADOW"
	KindReplay     DecisionKind = "REPLAY"
	KindResolution DecisionKind = "RESOLUTION"
	KindControl    DecisionKind = "CONTROL"
)

// Decision is the full, persisted decision record — the audit chain's payload.
type Decision struct {
	EndToEndID   string
	DecisionSeq  int
	Kind         DecisionKind
	DecidedAtMs  int64
	AcceptedAtMs int64

	Action             Action
	PreAdvisoryAction  Action // what our own data alone concluded, before any advisory (docs/04 §5)
	RailFired          string
	ReasonCodes        []string

	PModel            *float64 // calibrated probability
	PPrevalenceAdj    *float64 // after prior correction
	ExpectedLossMinor *int64
	ExpectedCostMinor *int64 // includes friction — the real objective (docs/04 §2)

	Features          *FeatureVector
	Findings          []Finding

	ModelBundleVersion    string
	PolicyVersion         string
	RulesVersion          string
	SignalRegistryVersion string

	IsControl        bool
	ActionPropensity float64 // P(this action | policy), for off-policy eval

	Degraded []string

	TotalMs      float64
	QueueDelayMs float64
	ServiceMs    float64

	// audit chain
	DecisionShard int16
	ChainSeq      int64
	PrevHash      []byte
	Hash          []byte
	CheckpointID  *int64
}
