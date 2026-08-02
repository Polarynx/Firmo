// ── Demo mode ───────────────────────────────────────────────────────────────
//
// While a walkthrough is playing, the controls it presses must answer from
// canned data rather than from the network.
//
// This was not a nicety. The tours ran against whatever the student happened to
// have on screen, so pressing "Why it matters" fired a real request about a real
// paper — which needs a real query, a real abstract and a live model, and which
// returned "couldn't analyze that" whenever any of the three was missing. A
// walkthrough that demonstrates an error message is worse than one that shows
// nothing, because the viewer cannot tell whether they are watching a feature or
// a fault.
//
// So a demo is a closed world: one example paper, one set of results, one
// pre-written answer per control. Nothing it does can fail, cost a request, or
// depend on the state of the account watching it. Everything the student had is
// snapshotted before it starts and put back when it ends.

let active = false

export function setDemoActive(v) { active = !!v }
export function isDemoActive() { return active }

// Keyed by the control, then by whatever identifies the thing it was pressed on.
// Deliberately written out rather than generated: these are the sentences a
// viewer reads to decide whether Firmo is any good, and they should be as
// carefully chosen as the interface around them.
const CANNED = {
  why: {
    default:
      'Directly answers your question. This is the paper that made the "no measurable job loss" '
      + 'result impossible to wave away, because it compared two adjacent states rather than '
      + 'modelling a counterfactual. Cite it as the empirical turning point, not as the last word.',
    'The New Minimum Wage Research':
      'Useful precisely because it disagrees with your other sources. Neumark argues the '
      + 'border-discontinuity designs understate job losses among the least-skilled. Your paper is '
      + 'stronger for answering this than for leaving it out.',
    'Minimum Wage Effects Across State Borders':
      'Tells you when the effect holds and when it does not. The border-pair design is the reason '
      + 'this literature moved from theory to measurement, and it is the method your other '
      + 'estimates inherit.',
  },
  summary: {
    default:
      'Surveyed 410 fast-food restaurants either side of the New Jersey border, before and after '
      + 'the 1992 wage rise. Employment in New Jersey rose slightly relative to Pennsylvania. The '
      + 'finding held after controls for chain and store size.',
    'The New Minimum Wage Research':
      'A review of two decades of minimum wage studies. Argues the credible-design literature '
      + 'systematically understates disemployment among teenagers and the least-skilled, and that '
      + 'publication bias runs toward null results.',
  },
  ask:
    'They disagree about method, not about what happened. Card and Krueger and Dube et al. compare '
    + 'places that sit next to each other; Neumark uses national panels with state controls. Both '
    + 'read the same employment data. The argument is over which comparison is credible, so a paper '
    + 'that takes a side has to defend the counterfactual, not the numbers.',
}

export function cannedWhy(title) {
  return CANNED.why[title] || CANNED.why.default
}

export function cannedSummary(title) {
  return CANNED.summary[title] || CANNED.summary.default
}

export function cannedAsk() {
  return CANNED.ask
}

/** Pretend a request took a moment, so the interface reads as working. */
export function fakeLatency(ms = 700) {
  return new Promise(r => setTimeout(r, ms))
}
