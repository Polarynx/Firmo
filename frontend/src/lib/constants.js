export const SOURCE_LABELS = {
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

export const CITATION_STYLES = [
  { key: 'apa', label: 'APA 7' },
  { key: 'mla', label: 'MLA 9' },
  { key: 'chicago', label: 'Chicago' },
  { key: 'harvard', label: 'Harvard' },
  { key: 'ieee', label: 'IEEE' },
]

export const STANCE = {
  supports: {
    label: 'Supports',
    chip: 'text-brand-500 border-brand-500/50 dark:text-signal dark:border-signal/40',
    dot: 'bg-brand-500 dark:bg-signal',
    rail: 'border-l-brand-500 dark:border-l-signal',
  },
  counters: {
    label: 'Counterpoint',
    chip: 'text-orange-600 border-orange-400/50 dark:text-orange-300 dark:border-orange-500/40',
    dot: 'bg-orange-500',
    rail: 'border-l-orange-500',
  },
  mixed: {
    label: 'Mixed evidence',
    chip: 'text-amber-600 border-amber-400/50 dark:text-amber-300 dark:border-amber-500/40',
    dot: 'bg-amber-400',
    rail: 'border-l-amber-400',
  },
  background: {
    label: 'Background',
    chip: 'text-t2 border-line',
    dot: 'bg-t3',
    rail: 'border-l-line',
  },
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
    chip: 'text-t2 border-line',
    dot: 'bg-t3',
  },
  unchecked: {
    label: 'Not checked',
    chip: 'text-t2 border-line',
    dot: 'bg-t3',
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
  unchecked: { label: 'Try again', chip: 'text-t2 border-line', dot: 'bg-t3', rail: 'border-l-line' },
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
