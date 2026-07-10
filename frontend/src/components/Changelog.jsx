const VERSIONS = [
  {
    version: 'v2.0',
    label: 'Latest',
    title: 'The Research Hub',
    changes: [
      'Complete pivot: Firmo is now a research assistant for writing essays and papers — from blank page to bibliography',
      'One smart input — type a topic, thesis, or research question and Firmo detects which and adapts',
      'Live streaming results: the research brief appears in seconds, papers stream in while ranking finishes',
      'Research brief with suggested angles for your paper and related topics to explore next',
      'Evidence stance on every source — Supports, Counterpoint, Mixed, or Background — with filter chips showing the balance of evidence',
      'Projects: one per paper, with every saved source stored per-project in your browser',
      'Works Cited panel — a real alphabetized bibliography that builds itself as you save sources',
      'Correct citations at last: DOI papers are formatted from the publisher\'s full record via CrossRef (journal, volume, issue, pages) in APA 7, MLA 9, Chicago, Harvard, and IEEE',
      'Copy-all bibliography, plus BibTeX and RIS export for Zotero and Mendeley',
      'Free PDF badges — legal open-access copies found via Unpaywall',
      'Faster searches: merged AI calls, a hard time budget so slow databases never block results, and chunked ranking that no longer silently drops papers',
      'New identity: pine green, paper white, and a proper serif — plus a redesigned walkthrough',
    ],
  },
  {
    version: 'v1.3',
    label: null,
    title: 'Extended Sources',
    changes: [
      'Expanded from 6 to 14 academic databases searched simultaneously',
      'arXiv — preprints in physics, math, CS, biology, economics, and more',
      'DOAJ — Directory of Open Access Journals, peer-reviewed open-access articles',
      'ERIC — US Department of Education database for education research',
      'Zenodo — CERN open research repository for papers, datasets, and preprints',
      'PLOS — Public Library of Science open-access journals',
      'HAL — French and European open archive of scholarly research',
      'INSPIRE-HEP — leading database for high-energy physics and related fields',
      'fatcat — Internet Archive Scholar index covering hundreds of millions of papers',
      'All new sources added to main search, Find More Sources, and Stress Test',
      'Source badge on every paper card — shows which database it came from plus journal name and citation count',
      'Database filter chips — filter displayed results by source after searching, with live count per database',
    ],
  },
  {
    version: 'v1.2',
    label: null,
    title: 'Topic Explorer',
    changes: [
      'Topic Explorer mode — search by keyword or topic area, not just a specific claim',
      'Research landscape overview: AI-generated summary of what the field studies and debates',
      'Related topics chips for navigating adjacent research areas',
      'All source features work in topic mode: cite, summarize, dig deep, synthesize, find more, ask',
      'Changelog viewer — this panel, opened by clicking the version number',
      'Version naming redesigned to start from v1.0',
    ],
  },
  {
    version: 'v1.1',
    label: null,
    title: 'Guidance',
    changes: [
      'Guided walkthrough tutorial — 16-step game-style tour of every feature, accessible via ? button',
      'Each step includes a Pro Tip on how to get the most out of that feature',
      'Startup fix — Firmo now opens clean every time instead of reloading the last search',
    ],
  },
  {
    version: 'v1.0',
    label: null,
    title: 'Foundation',
    changes: [
      'Single claim search across 6 databases simultaneously (Semantic Scholar, CrossRef, PubMed, OpenAlex, Europe PMC, BASE)',
      'AI claim evaluation with confidence score (0–100%) — how well the evidence supports the claim',
      'Debatable mode — when a claim is contested, toggle between supporting and alternative-angle sources',
      'Stress Test — generates the strongest academic counterargument + opposing papers',
      'Related claims chips for exploring adjacent ideas',
      'Essay Checker — extracts up to 8 factual claims from pasted text with color-coded confidence bars',
      'Source cards: title, authors, abstract preview, database badge, citation count',
      'Citation generator — APA, MLA, Chicago with full reference and in-text format, copy-to-clipboard',
      'Summarize — one-sentence plain-English summary of any abstract',
      'Dig Deep — 3–4 sentence analysis of what the paper studied and how it relates to your claim',
      'Evidence synthesis — AI verdict across up to 12 sources at once',
      'Find more sources — 5 alternative search queries, no duplicates with existing results',
      'Ask sources — free-form questions answered based on what the found papers actually say',
      'Save papers with original claim context, persisted in browser storage',
      'Search history — last 20 searches, re-runnable with one click',
      'Share via URL — copy a direct link to any search result',
      'Dark / light mode with system preference detection',
    ],
  },
]

export default function Changelog({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeInUp"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-[3px] border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Project progress</h2>
            <p className="text-xs text-gray-400 dark:text-gray-600">What each version added to Firmo</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-6">
          {VERSIONS.map(v => (
            <div key={v.version} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100">{v.version}</span>
                <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">— {v.title}</span>
                {v.label && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
                    {v.label}
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {v.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="text-brand-400 dark:text-brand-600 mt-0.5 shrink-0">+</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
