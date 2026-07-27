import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { postJSON } from '../../lib/api'
import { inTextCitationWithPage } from '../../lib/cite'
import { paperId } from '../../lib/projects'
import { SOURCE_LABELS, STANCE, SPRING } from '../../lib/constants'
import { renderMarkup, stripMarkup } from '../../lib/richText'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedIds } from '../../stores/selectors'
import { Chip } from '../ui/primitives'

const ABSTRACT_LIMIT = 190

// A catalogue card. Everything needed to judge a source and act on it, sized
// for the context sidebar rather than a full-width results page.

export default function SourceCard({ paper, index = 0, query = '', showStance = true, compact = false }) {
  const style = useWorkspaceStore(s => s.citationStyle)
  const toggleSource = useWorkspaceStore(s => s.toggleSource)
  const savedIds = useSavedIds()
  const isSaved = savedIds.has(paperId(paper))

  const [open, setOpen] = useState(false)
  const [cite, setCite] = useState(null)
  const [citing, setCiting] = useState(false)
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState('')
  const [why, setWhy] = useState(null)
  const [quotes, setQuotes] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [copied, setCopied] = useState('')

  const authors = Array.isArray(paper.authors) ? paper.authors : []
  const abstract = paper.abstract || ''
  const stance = STANCE[paper.stance]

  function flash(key) {
    setCopied(key)
    setTimeout(() => setCopied(''), 1800)
  }

  async function handleCite() {
    if (cite) { setCite(null); return }
    setCiting(true)
    try {
      const data = await postJSON('/api/cite', { ...paper, style })
      setCite(data)
    } catch {
      setCite({ citation: 'Could not generate this citation.', intext: '', exact: false })
    } finally {
      setCiting(false)
    }
  }

  async function handleSummarize() {
    if (summary || busy || !abstract) return
    setBusy('summary')
    try {
      const data = await postJSON('/api/summarize', { abstract })
      setSummary(data.summary)
    } catch {
      setSummary('Could not summarize.')
    } finally { setBusy('') }
  }

  async function handleWhy() {
    if (why || busy || !abstract) return
    setBusy('why')
    try {
      const data = await postJSON('/api/digdeep', { claim: query, title: paper.title, abstract })
      setWhy(data.analysis)
    } catch {
      setWhy('Could not analyze.')
    } finally { setBusy('') }
  }

  async function handleQuotes() {
    if (quotes || busy || !paper.oa_pdf) return
    setBusy('quotes')
    setQuoteError('')
    try {
      const data = await postJSON('/api/quotes', {
        pdf_url: paper.oa_pdf, query: query || paper.title, title: paper.title,
      })
      setQuotes(data.quotes || [])
    } catch {
      setQuoteError("Couldn't read this PDF. Not every publisher allows it — open it and quote by hand.")
    } finally { setBusy('') }
  }

  function copyQuote(q, i) {
    const c = inTextCitationWithPage(paper, style, q.page)
    navigator.clipboard.writeText(`"${q.quote}" ${c}`).then(() => flash(`q${i}`))
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: Math.min(index, 6) * 0.03 }}
      className={`card p-3.5 flex flex-col gap-2.5 border-l-2 ${stance?.rail || 'border-l-line'}
        hover:border-brand-500/40 transition-colors`}
    >
      {/* Call-number line */}
      <div className="flex items-center justify-between gap-2 record">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-brand-500 dark:text-signal font-medium shrink-0">
            Nº {String(index + 1).padStart(2, '0')}
          </span>
          {paper.source && <span className="truncate">{SOURCE_LABELS[paper.source] || paper.source}</span>}
          {paper.citationCount > 0 && (
            <span className="shrink-0">{paper.citationCount.toLocaleString()} cited</span>
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {paper.year && <span className="tabular-nums">{paper.year}</span>}
          <button
            onClick={() => toggleSource(paper, query)}
            title={isSaved ? 'Remove from project' : 'Save to project'}
            className={`transition-colors ${
              isSaved ? 'text-brand-500 dark:text-signal' : 'text-t3 hover:text-brand-500 dark:hover:text-signal'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"
              fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </span>
      </div>

      <h3 className="font-display font-semibold text-[13.5px] leading-snug text-t1">
        {paper.url ? (
          <a href={paper.url} target="_blank" rel="noopener noreferrer"
            className="hover:text-brand-500 dark:hover:text-signal transition-colors">
            {paper.title}
          </a>
        ) : paper.title}
      </h3>

      {(authors.length > 0 || paper.journal) && (
        <p className="text-[11px] text-t2 leading-snug -mt-1">
          {authors.slice(0, 3).join(', ')}{authors.length > 3 ? ' et al.' : ''}
          {authors.length > 0 && paper.journal && <span className="text-t3"> · </span>}
          {paper.journal && <span className="italic">{paper.journal}</span>}
        </p>
      )}

      {paper.doi && (
        <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer"
          className="record hover:text-brand-500 dark:hover:text-signal transition-colors truncate">
          doi:{paper.doi}
        </a>
      )}

      {/* Stamps: safety first, then stance, then access */}
      {(paper.retracted || paper.preprint || (showStance && stance) || paper.oa_pdf) && (
        <div className="flex items-center flex-wrap gap-1.5">
          {paper.retracted && (
            <Chip
              tone={{ chip: 'text-red-500 border-red-500/50 bg-red-500/10', dot: 'bg-red-500' }}
              label="Retracted — do not cite"
              title="This paper has been retracted. Citing it will cost you credibility."
            />
          )}
          {!paper.retracted && paper.preprint && (
            <Chip
              tone={{ chip: 'text-amber-600 dark:text-amber-300 border-amber-500/40', dot: 'bg-amber-400' }}
              label="Preprint"
              title="Not peer-reviewed yet. Ask your instructor before leaning on it."
            />
          )}
          {showStance && stance && <Chip tone={stance} />}
          {paper.oa_pdf && (
            <a href={paper.oa_pdf} target="_blank" rel="noopener noreferrer"
              title="Open-access PDF, via Unpaywall"
              className="inline-flex items-center gap-1 font-mono text-[9px] font-medium uppercase
                tracking-[0.14em] px-2 py-0.5 rounded border border-highlight/60 bg-highlight/10
                text-amber-700 dark:text-highlight hover:bg-highlight/20 transition-colors">
              Free PDF
            </a>
          )}
        </div>
      )}

      {summary && (
        <p className="text-xs leading-relaxed text-brand-600 dark:text-signal/90 italic">{summary}</p>
      )}

      {abstract && !compact && (
        <p className="text-[11.5px] text-t2 leading-relaxed">
          {open || abstract.length <= ABSTRACT_LIMIT ? abstract : `${abstract.slice(0, ABSTRACT_LIMIT)}…`}
          {abstract.length > ABSTRACT_LIMIT && (
            <button onClick={() => setOpen(o => !o)}
              className="ml-1.5 text-[11px] font-medium text-brand-500 dark:text-signal hover:opacity-75">
              {open ? 'less' : 'more'}
            </button>
          )}
        </p>
      )}

      {why && (
        <div className="border-l-2 border-brand-500 dark:border-signal/70 bg-brand-500/[0.06] rounded-r px-3 py-2">
          <span className="eyebrow block mb-1">What this means</span>
          <p className="text-[11.5px] text-t1 leading-relaxed">{why}</p>
        </div>
      )}

      <AnimatePresence>
        {cite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING}
            className="flex flex-col gap-1.5 overflow-hidden"
          >
            <div className="rounded-md bg-app/70 border border-line px-3 py-2.5 font-mono
              text-[11px] leading-relaxed text-t1">
              {renderMarkup(cite.citation)}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigator.clipboard.writeText(stripMarkup(cite.citation)).then(() => flash('full'))}
                className="btn-ghost"
              >
                {copied === 'full' ? '✓ Copied' : 'Copy full'}
              </button>
              {cite.intext && (
                <button
                  onClick={() => navigator.clipboard.writeText(cite.intext).then(() => flash('in'))}
                  className="btn-ghost"
                >
                  {copied === 'in' ? '✓ Copied' : `In-text ${cite.intext}`}
                </button>
              )}
              <span className="text-[10px] text-t3">
                {cite.exact ? "From the publisher's record" : 'Check volume and pages'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {quoteError && <p className="text-[11px] text-t3">{quoteError}</p>}
      {quotes && (
        quotes.length === 0 ? (
          <p className="text-[11px] text-t3">Nothing in this PDF stood out as directly quotable.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Quotable, from the PDF</span>
            {quotes.map((q, i) => (
              <div key={i} className="border-l-2 border-l-highlight/80 bg-highlight/[0.06] rounded-r px-3 py-2 flex flex-col gap-1.5">
                <p className="text-[11.5px] text-t1 leading-relaxed">
                  “{q.quote}”
                  {q.page != null && <span className="record ml-1.5">· p. {q.page}</span>}
                </p>
                {q.why && <p className="text-[10.5px] text-t3">{q.why}</p>}
                <button onClick={() => copyQuote(q, i)}
                  className="self-start text-[11px] font-medium text-brand-500 dark:text-signal hover:opacity-75">
                  {copied === `q${i}` ? '✓ Copied with citation' : 'Copy with citation'}
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <button onClick={handleCite} disabled={citing} className="btn-ghost">
          {citing ? 'Citing…' : cite ? 'Hide citation' : 'Cite'}
        </button>
        {abstract && !summary && (
          <button onClick={handleSummarize} disabled={busy === 'summary'} className="btn-ghost">
            {busy === 'summary' ? 'Summarizing…' : 'Summarize'}
          </button>
        )}
        {abstract && !why && query && (
          <button onClick={handleWhy} disabled={busy === 'why'} className="btn-ghost">
            {busy === 'why' ? 'Reading…' : 'Why it matters'}
          </button>
        )}
        {paper.oa_pdf && !quotes && (
          <button onClick={handleQuotes} disabled={busy === 'quotes'} className="btn-ghost">
            {busy === 'quotes' ? 'Reading the PDF…' : 'Find quotes'}
          </button>
        )}
      </div>
    </motion.article>
  )
}
