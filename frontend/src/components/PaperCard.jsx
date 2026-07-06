import { useState, useEffect, useRef } from 'react'
import { postJSON } from '../lib/api'
import { SOURCE_LABELS, STANCE } from '../lib/constants'

const ABSTRACT_LIMIT = 220

function copyToClipboard(text, onDone) {
  navigator.clipboard.writeText(text).then(onDone)
}

export default function PaperCard({ paper, citationStyle, index = 0, query = '', isSaved = false, onToggleSave }) {
  const [cite, setCite] = useState(null) // { citation, intext, exact }
  const [loading, setLoading] = useState(false)
  const [copiedCite, setCopiedCite] = useState(false)
  const [copiedIntext, setCopiedIntext] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [summary, setSummary] = useState(null)
  const [summarizing, setSummarizing] = useState(false)
  const [digDeep, setDigDeep] = useState(null)
  const [digging, setDigging] = useState(false)
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
    <div className={`source-card animate-fadeInUp ${delayClass}`}>
      {/* Title + year + save */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 leading-snug flex-1 text-sm">
          {paper.url ? (
            <a href={paper.url} target="_blank" rel="noopener noreferrer"
              className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              {paper.title}
            </a>
          ) : paper.title}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {paper.year && (
            <span className="text-xs font-mono text-gray-400 dark:text-gray-600 tabular-nums">
              {paper.year}
            </span>
          )}
          {onToggleSave && (
            <button
              onClick={() => onToggleSave(paper)}
              title={isSaved ? 'Remove from project' : 'Save to project'}
              className={`transition-colors ${isSaved ? 'text-brand-500 dark:text-brand-400' : 'text-gray-300 dark:text-gray-700 hover:text-brand-400 dark:hover:text-brand-500'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Authors */}
      {authors.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          {authors.slice(0, 4).join(', ')}{authors.length > 4 ? ' et al.' : ''}
        </p>
      )}

      {/* Badges: stance · PDF · source · journal · citations */}
      <div className="flex items-center flex-wrap gap-1.5">
        {stance && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${stance.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${stance.dot}`} />
            {stance.label}
          </span>
        )}
        {paper.oa_pdf && (
          <a
            href={paper.oa_pdf}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-highlight/60 bg-highlight/15 text-amber-700 dark:text-amber-300 hover:bg-highlight/30 transition-colors"
            title="Open-access PDF (via Unpaywall)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
            </svg>
            Free PDF
          </a>
        )}
        {paper.source && (
          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-paper-100 dark:bg-ink-800 text-gray-500 dark:text-gray-400">
            {SOURCE_LABELS[paper.source] || paper.source}
          </span>
        )}
        {paper.journal && (
          <span className="text-[10px] text-gray-400 dark:text-gray-600 truncate max-w-[240px]" title={paper.journal}>
            {paper.journal}
          </span>
        )}
        {paper.citationCount > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">
            {paper.citationCount.toLocaleString()} citations
          </span>
        )}
      </div>

      {/* Abstract */}
      {abstract && (
        <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {summary && (
            <p className="text-brand-600 dark:text-brand-400 italic text-xs mb-1.5">
              {summary}
            </p>
          )}
          {expanded ? abstract : shortAbstract}
          {abstract.length > ABSTRACT_LIMIT && (
            <button onClick={() => setExpanded(e => !e)}
              className="ml-1.5 text-brand-500 hover:text-brand-600 dark:hover:text-brand-300 text-xs font-medium transition-colors">
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </div>
      )}

      {/* Dig Deeper panel */}
      {digDeep && (
        <div className="bg-brand-50/60 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-800/40 rounded-lg p-3 text-sm text-brand-900 dark:text-brand-200 leading-relaxed">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400 block mb-1">What this means for your paper</span>
          {digDeep}
        </div>
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
                : 'Built from available metadata — double-check volume and pages'}
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
