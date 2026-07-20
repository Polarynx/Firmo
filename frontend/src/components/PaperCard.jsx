import { useState, useEffect, useRef } from 'react'
import { postJSON } from '../lib/api'
import { inTextCitationWithPage } from '../lib/cite'
import { SOURCE_LABELS, STANCE } from '../lib/constants'

const ABSTRACT_LIMIT = 220

function copyToClipboard(text, onDone) {
  navigator.clipboard.writeText(text).then(onDone)
}

export default function PaperCard({ paper, citationStyle, index = 0, query = '', isSaved = false, onToggleSave, showStance = true }) {
  const [cite, setCite] = useState(null) // { citation, intext, exact }
  const [loading, setLoading] = useState(false)
  const [copiedCite, setCopiedCite] = useState(false)
  const [copiedIntext, setCopiedIntext] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [summary, setSummary] = useState(null)
  const [summarizing, setSummarizing] = useState(false)
  const [digDeep, setDigDeep] = useState(null)
  const [digging, setDigging] = useState(false)
  const [quotes, setQuotes] = useState(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [copiedQuote, setCopiedQuote] = useState(null)
  const hasGenerated = useRef(false)

  const delays = ['delay-0', 'delay-75', 'delay-150', 'delay-225', 'delay-300']
  const delayClass = delays[Math.min(index, delays.length - 1)]

  const authors = Array.isArray(paper.authors) ? paper.authors : []
  const abstract = paper.abstract || ''
  const shortAbstract = abstract.length > ABSTRACT_LIMIT
    ? abstract.slice(0, ABSTRACT_LIMIT) + '…'
    : abstract
  const stance = STANCE[paper.stance]

  async function fetchCitation(style) {
    setLoading(true)
    setCite(null)
    try {
      const data = await postJSON('/api/cite', { ...paper, style: style ?? citationStyle })
      setCite(data)
    } catch {
      setCite({ citation: 'Error generating citation.', intext: '', exact: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hasGenerated.current) {
      fetchCitation(citationStyle)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citationStyle])

  async function handleSummarize() {
    if (summary || summarizing || !abstract) return
    setSummarizing(true)
    try {
      const data = await postJSON('/api/summarize', { abstract })
      setSummary(data.summary)
    } catch {
      setSummary('Could not summarize.')
    } finally {
      setSummarizing(false)
    }
  }

  async function handleDigDeep() {
    if (digDeep || digging || !abstract) return
    setDigging(true)
    try {
      const data = await postJSON('/api/digdeep', { claim: query, title: paper.title, abstract })
      setDigDeep(data.analysis)
    } catch {
      setDigDeep('Could not analyze.')
    } finally {
      setDigging(false)
    }
  }

  // Read the actual open-access PDF and pull quotable passages with page numbers.
  async function handleQuotes() {
    if (quotes || quoting || !paper.oa_pdf) return
    setQuoting(true)
    setQuoteError('')
    try {
      const data = await postJSON('/api/quotes', {
        pdf_url: paper.oa_pdf, query: query || paper.title, title: paper.title,
      })
      setQuotes(data.quotes || [])
    } catch {
      setQuoteError("Couldn't read this PDF. Not every publisher allows it — open the PDF and quote by hand.")
    } finally {
      setQuoting(false)
    }
  }

  function handleCopyQuote(q, i) {
    const cite = inTextCitationWithPage(paper, citationStyle, q.page)
    navigator.clipboard.writeText(`"${q.quote}" ${cite}`).then(() => {
      setCopiedQuote(i)
      setTimeout(() => setCopiedQuote(null), 2000)
    })
  }

  function handleGenerate() {
    hasGenerated.current = true
    fetchCitation(citationStyle)
  }

  function handleCopyCite() {
    if (!cite?.citation) return
    copyToClipboard(cite.citation, () => {
      setCopiedCite(true)
      setTimeout(() => setCopiedCite(false), 2000)
    })
  }

  function handleCopyIntext() {
    if (!cite?.intext) return
    copyToClipboard(cite.intext, () => {
      setCopiedIntext(true)
      setTimeout(() => setCopiedIntext(false), 2000)
    })
  }

  return (
    <div className={`source-card ${stance?.rail || 'border-l-gray-200 dark:border-l-gray-700'} animate-fadeInUp ${delayClass}`}>
      {/* Call-number line: rank · database · citations, then year · save */}
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="text-brand-700 dark:text-brand-400 font-medium shrink-0">
            Nº {String(index + 1).padStart(2, '0')}
          </span>
          {paper.source && (
            <span className="truncate">{SOURCE_LABELS[paper.source] || paper.source}</span>
          )}
          {paper.citationCount > 0 && (
            <span className="shrink-0">{paper.citationCount.toLocaleString()} cited</span>
          )}
        </span>
        <span className="flex items-center gap-2.5 shrink-0">
          {paper.year && <span className="tabular-nums">{paper.year}</span>}
          {onToggleSave && (
            <button
              onClick={() => onToggleSave(paper)}
              title={isSaved ? 'Remove from project' : 'Save to project'}
              className={`transition-colors ${isSaved ? 'text-brand-600 dark:text-brand-400' : 'text-gray-300 dark:text-gray-700 hover:text-brand-500 dark:hover:text-brand-500'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-display font-semibold text-[15px] text-gray-900 dark:text-gray-100 leading-snug -mt-1">
        {paper.url ? (
          <a href={paper.url} target="_blank" rel="noopener noreferrer"
            className="hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
            {paper.title}
          </a>
        ) : paper.title}
      </h3>

      {/* Authors + journal */}
      {(authors.length > 0 || paper.journal) && (
        <p className="text-xs text-gray-500 dark:text-gray-500 -mt-1">
          {authors.slice(0, 4).join(', ')}{authors.length > 4 ? ' et al.' : ''}
          {authors.length > 0 && paper.journal && <span className="text-gray-300 dark:text-gray-700"> · </span>}
          {paper.journal && <span className="italic" title={paper.journal}>{paper.journal}</span>}
        </p>
      )}

      {/* Stamps: safety · stance · PDF */}
      {((showStance && stance) || paper.oa_pdf || paper.retracted || paper.preprint) && (
        <div className="flex items-center flex-wrap gap-1.5">
          {paper.retracted && (
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border border-red-400/70 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
              title="This paper has been retracted. Citing it will cost you credibility — find another source."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Retracted — do not cite
            </span>
          )}
          {!paper.retracted && paper.preprint && (
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border border-amber-400/60 text-amber-700 dark:text-amber-300 dark:border-amber-800"
              title="A preprint has not been peer-reviewed yet. Fine as supporting evidence; ask your instructor before leaning on it."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Preprint · not peer-reviewed
            </span>
          )}
          {showStance && stance && (
            <span className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border ${stance.chip}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stance.dot}`} />
              {stance.label}
            </span>
          )}
          {paper.oa_pdf && (
            <a
              href={paper.oa_pdf}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border border-highlight/70 bg-highlight/10 text-amber-700 dark:text-amber-300 hover:bg-highlight/25 transition-colors"
              title="Open-access PDF (via Unpaywall)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
              </svg>
              Free PDF
            </a>
          )}
        </div>
      )}

      {/* One-line summary (on request). Labeled so it never blurs into the abstract. */}
      {summary && (
        <div className="text-sm leading-relaxed">
          <span className="section-label">Summary</span>
          <span className="text-brand-700 dark:text-brand-300 italic">{summary}</span>
        </div>
      )}

      {/* Abstract */}
      {abstract && (
        <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          <span className="section-label">Abstract</span>
          {expanded ? abstract : shortAbstract}
          {abstract.length > ABSTRACT_LIMIT && (
            <button onClick={() => setExpanded(e => !e)}
              className="ml-1.5 text-brand-500 hover:text-brand-600 dark:hover:text-brand-300 text-xs font-medium transition-colors">
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </div>
      )}

      {/* Why it matters (on request) */}
      {digDeep && (
        <div className="border-l-2 border-brand-500 bg-brand-50/50 dark:bg-brand-950/20 rounded-[2px] p-3 text-sm text-brand-900 dark:text-brand-200 leading-relaxed">
          <span className="section-label !text-brand-700 dark:!text-brand-400">What this means</span>
          {digDeep}
        </div>
      )}

      {/* Quotable passages pulled from the actual PDF, with page numbers */}
      {quoteError && (
        <p className="text-xs text-gray-400 dark:text-gray-600">{quoteError}</p>
      )}
      {quotes && (
        quotes.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-600">
            Nothing in this PDF stood out as directly quotable for your topic.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="section-label">Quotable, from the PDF</span>
            {quotes.map((q, i) => (
              <div key={i} className="border-l-2 border-l-highlight/80 bg-highlight/5 rounded-[2px] px-3 py-2.5 flex flex-col gap-1.5">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  “{q.quote}”
                  {q.page != null && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 ml-1.5">
                      · PDF p. {q.page}
                    </span>
                  )}
                </p>
                {q.why && <p className="text-xs text-gray-400 dark:text-gray-500">{q.why}</p>}
                <button onClick={() => handleCopyQuote(q, i)} className="self-start text-xs text-brand-600 dark:text-brand-400 hover:text-brand-500 font-medium transition-colors">
                  {copiedQuote === i ? '✓ Copied with citation' : 'Copy with citation'}
                </button>
              </div>
            ))}
            <span className="text-[10px] text-gray-400 dark:text-gray-600 px-1">
              Page numbers are PDF pages; check them against the journal's printed page numbers when citing.
            </span>
          </div>
        )
      )}

      {/* Citation */}
      {(cite || loading) && (
        <div className="flex flex-col gap-1">
          <div className="terminal-box">
            {loading
              ? <span className="text-gray-400 animate-pulse">Generating {citationStyle.toUpperCase()}…</span>
              : cite?.citation}
          </div>
          {cite && !loading && (
            <span className="text-[10px] text-gray-400 dark:text-gray-600 px-1">
              {cite.exact
                ? 'Formatted from the publisher\'s full record'
                : 'Built from available metadata, so double-check volume and pages'}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={handleGenerate} disabled={loading} className="btn-secondary text-xs disabled:opacity-40">
          {loading ? 'Loading…' : 'Cite'}
        </button>
        {abstract && !summary && (
          <button onClick={handleSummarize} disabled={summarizing} className="btn-secondary text-xs disabled:opacity-40">
            {summarizing ? 'Summarizing…' : 'Summarize'}
          </button>
        )}
        {abstract && !digDeep && query && (
          <button onClick={handleDigDeep} disabled={digging} className="btn-secondary text-xs disabled:opacity-40">
            {digging ? 'Analyzing…' : 'Why it matters'}
          </button>
        )}
        {paper.oa_pdf && !quotes && (
          <button onClick={handleQuotes} disabled={quoting} className="btn-secondary text-xs disabled:opacity-40">
            {quoting ? 'Reading the PDF…' : 'Find quotes'}
          </button>
        )}
        {cite && !loading && (
          <>
            <button onClick={handleCopyCite} className="btn-primary text-xs">
              {copiedCite ? '✓ Copied' : 'Copy citation'}
            </button>
            {cite.intext && (
              <button onClick={handleCopyIntext} className="btn-secondary text-xs">
                {copiedIntext ? '✓ Copied' : `In-text ${cite.intext}`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
