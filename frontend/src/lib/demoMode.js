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
    'Minimum Wages and Employment: A Case Study of the Fast-Food Industry in New Jersey and Pennsylvania':
      'This is the empirical turning point, so cite it as the study that made the null result impossible to '
      + 'wave away. It compared two adjacent states rather than modelling a counterfactual, which is why it '
      + 'changed the field. It is not the last word, and your paper should not treat it as one.',
    'The Effect of Minimum Wages on Low-Wage Jobs: Evidence from the United States Using a Bunching Estimator':
      'Your strongest single number. 138 policy changes, and the count of low-wage jobs barely moves. Use it '
      + 'where you need a magnitude rather than a direction.',
    'The New Minimum Wage Research':
      'Useful precisely because it disagrees with your other sources. Neumark argues the border designs '
      + 'understate losses among the least-skilled. Your paper is stronger for answering this than for '
      + 'leaving it out.',
    'Minimum Wage Effects Across State Borders':
      'This is the method your other estimates inherit. County pairs across a state line share a labour '
      + 'market but not a wage floor, which is the cleanest natural experiment the literature has.',
    'Employment Effects of Minimum Wages in Low-Income Countries: A Meta-Analysis':
      'Tells you when the effect appears rather than whether it does. Close to zero on average, but it grows '
      + 'sharply where enforcement is weak. This is the source for any sentence about conditions.',
    'Difference-in-Differences with Variation in Treatment Timing':
      'Methodological rather than empirical. Read it if you plan to say anything about staggered adoption, '
      + 'because it shows when the standard estimator is biased and your other sources rely on it.',
    'Wage Floors and Rapid Employment Collapse: Evidence from Four Metropolitan Labour Markets':
      'Do not cite this. It has been withdrawn by the journal after the panel specification was found to be '
      + 'wrong. It still appears in reference lists and in chatbot output, which is exactly why Firmo checks.',
    'State Minimum Wage Rates, 1968–2023':
      'Background, not evidence. Use it for the actual rates and dates when you need to state what a policy '
      + 'was, and cite something else for what the policy did.',
    default:
      'On topic and worth reading, though it argues a narrower point than your question asks. Use it to '
      + 'support a specific step rather than as a headline source.',
  },
  summary: {
    'Minimum Wages and Employment: A Case Study of the Fast-Food Industry in New Jersey and Pennsylvania':
      'Surveyed 410 fast-food restaurants either side of the New Jersey border, before and after the 1992 '
      + 'wage rise. Employment in New Jersey rose slightly relative to Pennsylvania, and the finding held '
      + 'after controls for chain and store size.',
    'The Effect of Minimum Wages on Low-Wage Jobs: Evidence from the United States Using a Bunching Estimator':
      'Counted jobs directly above and below the new wage floor across 138 state changes. Jobs moved up the '
      + 'distribution rather than disappearing from it.',
    'The New Minimum Wage Research':
      'A review of two decades of studies. Argues the credible-design literature understates job losses '
      + 'among teenagers and the least-skilled, and that publication bias runs toward null results.',
    'Minimum Wage Effects Across State Borders':
      'Sixteen years of policy changes, compared across county pairs that share a labour market but sit in '
      + 'different states. No detectable employment loss in restaurants or retail.',
    'Employment Effects of Minimum Wages in Low-Income Countries: A Meta-Analysis':
      'Pools 74 estimates from 23 countries. Effects average near zero but vary sharply with enforcement '
      + 'capacity and the size of the informal sector.',
    'Difference-in-Differences with Variation in Treatment Timing':
      'Shows that the two-way fixed effects estimator is a weighted average of every possible two-group '
      + 'comparison, including ones that use already-treated units as controls, which can flip the sign.',
    'Wage Floors and Rapid Employment Collapse: Evidence from Four Metropolitan Labour Markets':
      'Reported a sharp employment fall after four municipal ordinances. Retracted: the panel was '
      + 'mis-specified and the result did not survive correction.',
    'State Minimum Wage Rates, 1968–2023':
      'A reference table of state and federal minimum wage rates by year. No analysis, no findings.',
    default:
      'Reports its result from a single dataset, with the usual caveats about generalising beyond the '
      + 'setting it studied.',
  },
  ask:
    'They disagree about method, not about what happened. Card and Krueger and Dube compare places that sit '
    + 'next to each other. Neumark uses national panels with state controls. Both read the same employment '
    + 'data, so the argument is over which comparison is credible. A paper taking a side has to defend the '
    + 'counterfactual, not the numbers.',
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
