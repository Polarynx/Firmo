// ── Fixture mode ─────────────────────────────────────────────────────────────
//
// `?lab` boots the workspace already mid-paper: a project with saved sources, a
// brief, an outline, a checked draft, an audited reference list. Dev only, and
// never on the shared-record route.
//
// This exists because the workspace cannot be looked at otherwise. Reaching a
// populated state the normal way costs a live search — thirty seconds, sixteen
// APIs, an LLM — and in some environments that request never completes at all,
// which is how a whole panel once shipped without anyone having seen it render.
// A fixture is not a test; it is a way to put eyes on the thing being built.
//
// The data is deliberately awkward rather than tidy: a long title that wraps, a
// source with no abstract, an outline section with a gap in it, a claim whose
// evidence disagrees. A fixture full of neat 60-character titles proves the
// layout works for content that never arrives.

const YES = () =>
  import.meta.env.DEV
  && !/^\/record\//.test(window.location.pathname)
  && new URLSearchParams(window.location.search).has('lab')

export const isLab = YES()

const SOURCES = [
  {
    title: 'Minimum Wages and Employment: A Case Study of the Fast-Food Industry in New Jersey and Pennsylvania',
    authors: ['David Card', 'Alan B. Krueger'], year: 1994,
    abstract: 'On April 1, 1992 New Jersey\'s minimum wage rose from $4.25 to $5.05 per hour. To evaluate the impact of the law we surveyed 410 fast-food restaurants in New Jersey and eastern Pennsylvania before and after the rise.',
    doi: '10.3386/w4509', url: 'https://doi.org/10.3386/w4509',
    journal: 'American Economic Review', citationCount: 4821,
    source: 'crossref', stance: 'finding', shape: 'extent', relevanceScore: 10, tier: 'core',
  },
  {
    title: 'The Effect of Minimum Wages on Low-Wage Jobs: Evidence from the United States Using a Bunching Estimator',
    authors: ['Doruk Cengiz', 'Arindrajit Dube', 'Attila Lindner', 'Ben Zipperer'], year: 2019,
    abstract: 'We estimate the effect of minimum wages on low-wage jobs using 138 prominent state-level minimum wage changes between 1979 and 2016, and find the overall number of low-wage jobs remained essentially unchanged.',
    doi: '10.1093/qje/qjz014', url: 'https://doi.org/10.1093/qje/qjz014',
    journal: 'Quarterly Journal of Economics', citationCount: 912,
    source: 'openalex', stance: 'finding', shape: 'extent', relevanceScore: 10, tier: 'core',
    oa_pdf: 'https://example.org/qje.pdf',
  },
  {
    title: 'The New Minimum Wage Research',
    authors: ['David Neumark'], year: 2018,
    abstract: 'A review arguing that the evidence still points to job losses concentrated among the least-skilled, and that the bunching and border-discontinuity designs understate disemployment.',
    doi: '10.1257/jep.32.1.123', url: 'https://doi.org/10.1257/jep.32.1.123',
    journal: 'Journal of Economic Perspectives', citationCount: 640,
    source: 'crossref', stance: 'tension', shape: 'extent', relevanceScore: 9, tier: 'core',
  },
  {
    title: 'Minimum Wage Effects Across State Borders',
    authors: ['Arindrajit Dube', 'T. William Lester', 'Michael Reich'], year: 2010,
    // No abstract on purpose: a card has to survive a record that arrived bare.
    abstract: '',
    doi: '10.1162/REST_a_00039', url: 'https://doi.org/10.1162/REST_a_00039',
    journal: 'Review of Economics and Statistics', citationCount: 2140,
    source: 'semantic_scholar', stance: 'conditional', shape: 'extent', relevanceScore: 9, tier: 'core',
  },
  {
    title: 'Employment Effects of Minimum Wages in Low-Income Countries: A Meta-Analysis',
    authors: ['Nicolás Rodríguez-Pérez'], year: 2021,
    abstract: 'Pooling 74 estimates from 23 low- and middle-income countries, effects are close to zero on average but vary sharply with enforcement capacity and the share of informal employment.',
    doi: '10.1016/j.worlddev.2021.105512', url: 'https://doi.org/10.1016/j.worlddev.2021.105512',
    journal: 'World Development', citationCount: 88,
    source: 'europe_pmc', stance: 'conditional', shape: 'extent', relevanceScore: 8, tier: 'core',
  },
  {
    title: 'Difference-in-Differences with Variation in Treatment Timing',
    authors: ['Andrew Goodman-Bacon'], year: 2021,
    abstract: 'Decomposes the two-way fixed effects estimator into a weighted average of all possible two-group comparisons, showing when staggered adoption designs are biased.',
    doi: '10.1016/j.jeconom.2021.03.014', url: 'https://doi.org/10.1016/j.jeconom.2021.03.014',
    journal: 'Journal of Econometrics', citationCount: 3300,
    source: 'arxiv', stance: 'framework', shape: 'extent', relevanceScore: 8, tier: 'core',
    preprint: true,
  },
  {
    title: 'State Minimum Wage Rates, 1968–2023',
    authors: ['U.S. Department of Labor'], year: 2023,
    abstract: 'Historical table of state and federal minimum wage rates.',
    doi: null, url: 'https://www.dol.gov/agencies/whd/state/minimum-wage/history',
    journal: 'Wage and Hour Division', citationCount: 0,
    source: 'base', stance: 'context', shape: 'extent', relevanceScore: 7, tier: 'related',
  },
]

const BRIEF = {
  input_type: 'question',
  question_shape: 'extent',
  corrected_input: 'To what extent does raising the minimum wage reduce employment?',
  brief: 'The weight of recent evidence puts the employment effect of moderate minimum wage rises close to zero, with the sharpest disagreement being methodological rather than empirical. Border-discontinuity and bunching designs find little or no job loss; the studies that still find it tend to use national panels that critics argue absorb the wrong variation. What almost everyone agrees on is that the effect grows once the wage floor gets high relative to local median pay.',
  brief_items: [],
  angles: [
    { title: 'The methodology fight', why: 'The disagreement is about which counterfactual is credible, not about what happened.' },
    { title: 'Where the floor bites', why: 'Effects scale with the minimum relative to the local median, not with the dollar figure.' },
    { title: 'Enforcement and informality', why: 'In economies with weak enforcement the law and the wage are different things.' },
    { title: 'Monopsony', why: 'Wage-setting power reverses the textbook prediction and is now the mainstream explanation.' },
  ],
  related: [
    'Does the minimum wage reduce poverty?',
    'How does monopsony power affect wage setting?',
    'What happens when the minimum wage exceeds the local median?',
  ],
}

const OUTLINE = [
  {
    title: 'The textbook prediction and why it survived so long',
    points: [
      { point: 'Competitive labour markets imply a wage floor above equilibrium destroys jobs.', sources: [{ label: 'NEU18', title: 'The New Minimum Wage Research' }] },
      { point: 'The prediction went untested against credible counterfactuals until the 1990s.', sources: [] , gap_query: 'minimum wage research before 1990' },
    ],
  },
  {
    title: 'The natural-experiment turn',
    points: [
      { point: 'New Jersey and Pennsylvania gave a clean before-and-after comparison.', sources: [{ label: 'CAR94', title: 'Minimum Wages and Employment: A Case Study of the Fast-Food Industry in New Jersey and Pennsylvania' }] },
      { point: 'Border-pair designs generalised the approach across every state line.', sources: [{ label: 'DUB10', title: 'Minimum Wage Effects Across State Borders' }] },
    ],
  },
  {
    title: 'What the disagreement is actually about',
    points: [
      { point: 'Bunching estimators find the missing jobs are not missing.', sources: [{ label: 'CEN19', title: 'The Effect of Minimum Wages on Low-Wage Jobs: Evidence from the United States Using a Bunching Estimator' }] },
      { point: 'Two-way fixed effects can be biased under staggered adoption.', sources: [{ label: 'GOO21', title: 'Difference-in-Differences with Variation in Treatment Timing' }] },
    ],
  },
]

const DOC = `The minimum wage debate has never really been about the data.

Raising the minimum wage reduces employment among low-skilled workers. This was the textbook prediction for most of the twentieth century, and it went essentially unchallenged until researchers found a way to build a credible counterfactual.

Card and Krueger's 1994 study of fast-food restaurants along the New Jersey border found no such effect. Later work using every state boundary in the country reached the same conclusion, and a bunching estimator applied to 138 state-level changes found the number of low-wage jobs essentially unchanged.

The effect is much larger in countries with weak enforcement. That is the part of the literature most often left out of the American argument, and it is where the interesting disagreement now sits.`

const CLAIMS = [
  {
    id: 'c1',
    quote: 'Raising the minimum wage reduces employment among low-skilled workers.',
    claim: 'Raising the minimum wage reduces employment among low-skilled workers.',
    status: 'shaky',
    note: 'The studies with the most credible counterfactuals find effects close to zero. State this as the prediction being tested, not as a finding.',
  },
  {
    id: 'c2',
    quote: 'a bunching estimator applied to 138 state-level changes found the number of low-wage jobs essentially unchanged',
    claim: 'A bunching estimator over 138 state-level changes found low-wage employment unchanged.',
    status: 'backed',
    note: 'Cengiz et al. 2019, already saved to this paper.',
  },
  {
    id: 'c3',
    quote: 'The effect is much larger in countries with weak enforcement.',
    claim: 'Minimum wage employment effects are larger where enforcement is weak.',
    status: 'needs_citation',
    note: 'Plausible and supported, but a reader will expect a source here.',
  },
]

const CITATIONS = [
  {
    raw: 'Card, D., & Krueger, A. B. (1994). Minimum wages and employment: A case study of the fast-food industry in New Jersey and Pennsylvania. American Economic Review, 84(4), 772-793.',
    verdict: 'verified', note: 'Matches the published record.',
    matched: { title: 'Minimum Wages and Employment', year: 1994, doi: '10.3386/w4509', url: 'https://doi.org/10.3386/w4509' },
  },
  {
    raw: 'Neumark, D. (2018). The new minimum wage research. Journal of Economic Perspectives, 32(1).',
    verdict: 'mismatch', note: 'Found the paper, but the year on record is 2019.',
    matched: { title: 'The New Minimum Wage Research', year: 2019, doi: '10.1257/jep.32.1.123', url: 'https://doi.org/10.1257/jep.32.1.123' },
  },
  {
    raw: 'Halloway, T. R. (2020). Wage floors and the informal sector in coastal economies. Journal of Applied Labour Studies, 14(2), 88-107.',
    verdict: 'not_found',
    note: 'No matching record found on CrossRef. Double-check this one carefully: it may be misquoted, or it may not exist.',
    matched: null,
  },
]

/**
 * Fill the stores with a paper already in progress. Called once at boot, after
 * the stores exist, so it writes through their own setters where it can.
 */
export function seedLab({ useWorkspaceStore, useResearchStore, useAnnotationStore }) {
  if (!isLab) return

  const project = {
    id: 'lab-project',
    name: 'Minimum wage & employment',
    createdAt: Date.parse('2026-07-14T09:20:00Z'),
    sources: SOURCES.slice(0, 6),
    doc: DOC,
  }

  useWorkspaceStore.setState({
    projects: [project],
    activeProjectId: project.id,
    doc: DOC,
    activeMode: 'idle',
  })

  useResearchStore.setState({
    query: BRIEF.corrected_input,
    searchedQuery: BRIEF.corrected_input,
    brief: BRIEF,
    inputType: 'question',
    questionShape: 'extent',
    results: SOURCES,
    provisional: false,
    roleCounts: SOURCES.reduce((a, p) => ({ ...a, [p.stance]: (a[p.stance] || 0) + 1 }), {}),
    isSearching: false,
    stage: 'done',
    gathered: 428,
    kept: SOURCES.length,
    arms: [
      { query: 'minimum wage employment effects', found: 96 },
      { query: 'wage floor low skilled labour', found: 71 },
      { query: 'minimum wage meta-analysis', found: 54 },
      { query: 'monopsony wage setting', found: 43 },
    ],
  })

  useAnnotationStore.setState({
    claims: CLAIMS,
    outline: OUTLINE,
    citations: CITATIONS,
    outlineThesis: 'Moderate minimum wage rises do not measurably reduce employment.',
  })
}
