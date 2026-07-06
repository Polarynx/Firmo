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
    chip: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-800',
    dot: 'bg-brand-500',
  },
  counters: {
    label: 'Counterpoint',
    chip: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900',
    dot: 'bg-orange-500',
  },
  mixed: {
    label: 'Mixed evidence',
    chip: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
    dot: 'bg-amber-400',
  },
  background: {
    label: 'Background',
    chip: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700',
    dot: 'bg-gray-400',
  },
}

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
