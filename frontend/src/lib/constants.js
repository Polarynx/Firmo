export const SOURCE_LABELS = {
  upload: 'Your file',
  semantic_scholar: 'Semantic Scholar',
  crossref: 'CrossRef',
  pubmed: 'PubMed',
  openalex: 'OpenAlex',
  europe_pmc: 'Europe PMC',
  base: 'BASE',
  arxiv: 'arXiv',
  doaj: 'DOAJ',
  eric: 'ERIC',
  zenodo: 'Zenodo',
  plos: 'PLOS',
  hal: 'HAL',
  inspire_hep: 'INSPIRE-HEP',
  fatcat: 'Internet Archive Scholar',
  openaire: 'OpenAIRE',
  doab: 'DOAB (Open Access Books)',
}

// Short catalogue codes for the badge on a source card. A student scanning a
// column of results reads the stamp before the title, so it has to be the
// database's own shorthand rather than an invented abbreviation.
export const SOURCE_STAMPS = {
  upload: 'YOURS',
  semantic_scholar: 'S2',
  crossref: 'CR',
  pubmed: 'PM',
  openalex: 'OA',
  europe_pmc: 'EPM',
  base: 'BASE',
  arxiv: 'ARX',
  doaj: 'DOAJ',
  eric: 'ERIC',
  zenodo: 'ZEN',
  plos: 'PLOS',
  hal: 'HAL',
  inspire_hep: 'HEP',
  fatcat: 'IAS',
  openaire: 'OAIR',
  doab: 'DOAB',
}

// Offered on the empty canvas, one at a time.
//
// Three fixed rows used to sit here, which read as a menu — as though Firmo did
// those three things and the student had to pick one. A single line that
// changes on every visit reads as an example instead, and thirty of them show
// the range without a list: every discipline the index covers, and every shape
// of question Firmo classifies, so a student sees that "to what extent" and
// "what are the" are different kinds of ask before they type their own.
export const EXAMPLE_TOPICS = [
  'does remote work reduce productivity',
  'microplastics in drinking water',
  'how did the printing press change literacy',
  'to what extent do carbon offsets halt deforestation',
  'what are the ethical limits of predictive policing',
  'how did the East India Company reshape indigenous law',
  'is intermittent fasting better than calorie restriction',
  'what caused the late Bronze Age collapse',
  'how does algorithmic curation affect the public sphere',
  'does class size actually affect attainment',
  'what are the main failure modes of large language models',
  'how did antibiotics change childbirth mortality',
  'to what extent is gentrification driven by transit',
  'why did the Roman census records survive',
  'does bilingualism delay dementia',
  'what are the primary vulnerabilities of smart contracts',
  'how do coral reefs recover after bleaching',
  'to what extent did print culture cause the Reformation',
  'what explains the productivity slowdown since 2005',
  'how reliable is eyewitness testimony',
  'does urban green space reduce heat mortality',
  'what are the arguments against open borders',
  'how did the Black Death change European wages',
  'to what extent does social media polarise voters',
  'what is the evidence on four-day working weeks',
  'how did Ottoman archives record land tenure',
  'does microfinance actually raise incomes',
  'what are the limits of machine translation for low-resource languages',
  'how does sleep deprivation affect memory consolidation',
  'to what extent is obesity heritable',
]

export const CITATION_STYLES = [
  { key: 'apa', label: 'APA 7' },
  { key: 'mla', label: 'MLA 9' },
  { key: 'chicago', label: 'Chicago' },
  { key: 'harvard', label: 'Harvard' },
  { key: 'ieee', label: 'IEEE' },
]

// ── One rule governs every colour below ────────────────────────────────────
//
//   Cobalt is earned. It marks something the student can actually stand
//   behind — a verified citation, a claim their own sources cover, a source
//   they have saved. Nothing wears it for being new, selected, or on brand.
//
//   Graphite (`text-unverified`) is the resting state: real, but not yet
//   backed. It is deliberately hueless, so an unfinished paper looks
//   unfinished and a finished one visibly gains colour as the work gets done.
//
//   Amber and red stay reserved for "needs your attention" and "this is
//   wrong". Green belongs to the claim layer in the draft.
//
// Add a status here rather than hard-coding classes in a component, or the
// rule stops being checkable.

// ── What a source will do in the paper ─────────────────────────────────────
//
// Not "is it for or against". Firmo used to tag every source Supports /
// Counterpoint / Mixed / Background, which is the right vocabulary for exactly
// one kind of question — an arguable causal thesis — and quietly wrong for most
// of what students actually bring. "What are the primary vulnerabilities of
// DAOs" has no opposing side; a paper naming a fourth vulnerability is not a
// counterpoint to one naming the first three. "To what extent does trauma
// framing subvert Western redemption arcs" has no evidence to disagree with;
// there are readings, and calling one of them a counterpoint tells the student
// to stage a debate the field is not having.
//
// So the roles below are defined by FUNCTION — what the source lets the student
// do — which holds across empirical, interpretive, and enumerative work alike.
// The colour is fixed to the function, and only the wording changes per
// question shape, so the palette keeps meaning one thing everywhere.
export const ROLE = {
  finding: {
    label: 'Backs your point',
    chip: 'text-brand-500 border-brand-500/50 dark:text-signal dark:border-signal/40',
    dot: 'bg-brand-500 dark:bg-signal',
    rail: 'border-l-brand-500 dark:border-l-signal',
  },
  tension: {
    label: 'Pushes back',
    chip: 'text-orange-600 border-orange-400/50 dark:text-orange-300 dark:border-orange-500/40',
    dot: 'bg-orange-500',
    rail: 'border-l-orange-500',
  },
  conditional: {
    label: 'It depends',
    chip: 'text-amber-600 border-amber-400/50 dark:text-amber-300 dark:border-amber-500/40',
    dot: 'bg-amber-400',
    rail: 'border-l-amber-400',
  },
  // Framework and context are both graphite, because neither is evidence and
  // the palette rule says only evidence earns colour. They are told apart by
  // the dot instead: framework is a ring, context is a solid. An apparatus you
  // argue *with* and material you argue *about* are different jobs, and a
  // student assembling a methods section needs to see which is which without
  // reading every card.
  framework: {
    label: "How it's studied",
    chip: 'text-unverified border-unverified/30',
    dot: 'border border-unverified bg-transparent',
    rail: 'border-l-unverified/50',
  },
  context: {
    label: 'Background',
    chip: 'text-unverified border-unverified/20',
    dot: 'bg-unverified/60',
    rail: 'border-l-unverified/30',
  },
}

export const ROLE_ORDER = ['finding', 'tension', 'conditional', 'framework', 'context']

// The same five roles, said in the language the question is asking in. A
// magnitude question wants "Effect estimate", not "Finding"; a reading of a
// novel wants "Reading", not "Evidence". Only the label moves — the colour and
// the meaning stay put.
// The labels no longer change with the question type. A table of six
// vocabularies used to live here — "Effect estimate" for one shape, "Pathway"
// for another, "Names an item" for a third — which meant the words on screen
// were different every time a student searched for something new. They were
// precise and they were unlearnable, and precision nobody can read is not
// precision. `roleFor` keeps its shape argument so callers do not all have to
// change, and ignores it.

/** The role's config, worded for this question's shape. */
export function roleFor(key) {
  return ROLE[key] || ROLE.context
}

// What the panel calls the question, and the one line under it that says what a
// good answer to this kind of question looks like. Shown once, above the roles,
// because a student who has never been told that "to what extent" is not a
// yes/no question is the student Firmo exists for.
export const SHAPE = {
  extent: { label: 'How much', note: 'The answer is a size and what it depends on, not a yes or no.' },
  mechanism: { label: 'How it works', note: 'The answer is the pathways, named — usually two or three that carry the weight.' },
  comparison: { label: 'This or that', note: 'Two real explanations. The weaker one still has to be accounted for, not dismissed.' },
  enumeration: { label: 'What are the', note: 'The answer is a list, and it is judged on coverage. A missed item is the flaw.' },
  interpretive: { label: 'A reading', note: 'Positions are argued, not tested. Take one, and know what the strongest rival is.' },
  causal: { label: 'An argument', note: 'A claim with a real opposing case. Answer it in the paper rather than around it.' },
}

// ── Claim statuses ─────────────────────────────────────────────────────────
// Not "is this true?" but "can you back this up?" — every colour tells the
// student what to do next.
export const CLAIM_STATUS = {
  checking: {
    label: 'Checking',
    chip: 'text-t3 border-line',
    dot: 'bg-t3 animate-pulseDot',
  },
  needs_citation: {
    label: 'Needs a citation',
    chip: 'text-amber-600 border-amber-400/50 dark:text-amber-300 dark:border-amber-500/40',
    dot: 'bg-amber-400',
  },
  shaky: {
    label: 'Evidence disagrees',
    chip: 'text-red-600 border-red-400/50 dark:text-red-400 dark:border-red-500/40',
    dot: 'bg-red-500',
  },
  backed: {
    label: 'Covered by your sources',
    chip: 'text-brand-500 border-brand-500/50 dark:text-signal dark:border-signal/40',
    dot: 'bg-brand-500 dark:bg-signal',
  },
  cited: {
    label: 'Cited',
    chip: 'text-brand-500 border-brand-500/50 dark:text-signal dark:border-signal/40',
    dot: 'bg-brand-500 dark:bg-signal',
  },
  rewritten: {
    label: 'Reworded',
    chip: 'text-brand-500 border-brand-500/50 dark:text-signal dark:border-signal/40',
    dot: 'bg-brand-500 dark:bg-signal',
  },
  fine: {
    label: 'No citation needed',
    chip: 'text-unverified border-unverified/30',
    dot: 'bg-unverified',
  },
  unchecked: {
    label: 'Not checked',
    chip: 'text-unverified border-unverified/30',
    dot: 'bg-unverified',
  },
}

export const CLAIM_ORDER = [
  'shaky', 'needs_citation', 'backed', 'cited', 'rewritten', 'fine', 'unchecked', 'checking',
]

// ── Citation-audit verdicts ────────────────────────────────────────────────
export const VERDICT = {
  checking: { label: 'Checking', chip: 'text-t3 border-line', dot: 'bg-t3 animate-pulseDot', rail: 'border-l-line' },
  verified: {
    label: 'Verified',
    chip: 'text-brand-500 border-brand-500/50 dark:text-signal dark:border-signal/40',
    dot: 'bg-brand-500 dark:bg-signal',
    rail: 'border-l-brand-500 dark:border-l-signal',
  },
  mismatch: {
    label: 'Check details',
    chip: 'text-amber-600 border-amber-400/50 dark:text-amber-300 dark:border-amber-500/40',
    dot: 'bg-amber-400',
    rail: 'border-l-amber-400',
  },
  retracted: {
    label: 'Retracted',
    chip: 'text-red-600 border-red-400/50 dark:text-red-400 dark:border-red-500/40',
    dot: 'bg-red-500',
    rail: 'border-l-red-500',
  },
  not_found: {
    label: 'Not found',
    chip: 'text-red-600 border-red-400/50 dark:text-red-400 dark:border-red-500/40',
    dot: 'bg-red-500',
    rail: 'border-l-red-500',
  },
  unchecked: {
    label: 'Try again',
    chip: 'text-unverified border-unverified/30',
    dot: 'bg-unverified',
    rail: 'border-l-unverified/50',
  },
}

export const VERDICT_ORDER = ['not_found', 'retracted', 'mismatch', 'unchecked', 'verified', 'checking']

// Framer Motion: one spring for the whole application, so every panel,
// popover, and chip moves with the same weight.
export const SPRING = { type: 'spring', stiffness: 380, damping: 30 }

// Slightly looser, for large surfaces where the standard spring reads abrupt.
export const SPRING_SOFT = { type: 'spring', stiffness: 260, damping: 32 }

export const YEAR_OPTIONS = [
  { label: 'Any year', value: null },
  { label: 'After 2020', value: 2020 },
  { label: 'After 2015', value: 2015 },
  { label: 'After 2010', value: 2010 },
  { label: 'After 2000', value: 2000 },
  { label: 'After 1990', value: 1990 },
  { label: 'After 1980', value: 1980 },
  { label: 'After 1970', value: 1970 },
]
