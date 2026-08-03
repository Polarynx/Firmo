import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { postJSON } from '../../lib/api'
import { paperId } from '../../lib/projects'
import { cannedSummary, cannedWhy, fakeLatency, isDemoActive } from '../../lib/demoMode'
import { SOURCE_LABELS, SOURCE_STAMPS, roleFor, SPRING } from '../../lib/constants'
import { renderMarkup, stripMarkup } from '../../lib/richText'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedIds } from '../../stores/selectors'
import { Chip, Confidence, Stamp } from '../ui/primitives'

const ABSTRACT_LIMIT = 190

// A catalogue card. Everything needed to judge a source and act on it, sized
// for the context sidebar rather than a full-width results page.

export default function SourceCard({ paper, index = 0, query = '', shape = 'none', showRole = true, compact = false }) {
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
  const [copied, setCopied] = useState('')

  const authors = Array.isArray(paper.authors) ? paper.authors : []
  const abstract = paper.abstract || ''
  // The shape a paper was judged under is stamped on it, so a source saved from
  // an "extent" search still reads "Null or reversed" months later in a project
  // whose current search was something else entirely. The prop only wins when
  // the paper carries no shape of its own.
  const role = paper.stance ? roleFor(paper.stance, paper.shape || shape) : null

  // The ranker grades relevance out of 10 and that grade is what decides the
  // tier, so it is the honest number to show. Raw embedding cosine is not:
  // it sits near 0.8 for almost anything on the same subject and would read
  // as "everything is an 80% match".
  const match = typeof paper.relevanceScore === 'number'
    ? Math.max(0, Math.min(1, paper.relevanceScore / 10))
    : null

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
    // A walkthrough answers from its own script. Firing the real endpoint would
    // spend a request on a paper the viewer does not own, and return
    // "Could not summarize" whenever anything it needs is absent — which is a
    // demo teaching people that the button is broken.
    if (isDemoActive()) {
      await fakeLatency()
      setSummary(cannedSummary(paper.title))
      setBusy('')
      return
    }
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
    if (isDemoActive()) {
      await fakeLatency()
      setWhy(cannedWhy(paper.title))
      setBusy('')
      return
    }
    try {
      const data = await postJSON('/api/digdeep', { claim: query, title: paper.title, abstract })
      setWhy(data.analysis)
    } catch {
      setWhy('Could not analyze.')
    } finally { setBusy('') }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: Math.min(index, 6) * 0.03 }}
      whileHover={{ y: -2 }}
      className={`card card-hover p-3.5 flex flex-col gap-2.5 border-l-2 ${role?.rail || 'border-l-line'}
        hover:shadow-card`}
    >
      {/* Call-number line */}
      <div className="flex items-center justify-between gap-2 record">
        <span className="flex items-center gap-2 min-w-0">
          {/* The call number is cobalt only once the source is in the project.
              Colour in this workspace marks evidence the student actually
              holds; a result they have merely been shown is still graphite.

              Saving is the moment that colour is earned, so it is worth a beat:
              the number lands like a stamp rather than fading between two
              greys. `key` on the saved state is what makes it replay — without
              it React reuses the element and the animation never runs again. */}
          <motion.span
            key={isSaved ? 'saved' : 'unsaved'}
            initial={isSaved ? { scale: 1.3, rotate: -7 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 620, damping: 18 }}
            className={`font-medium shrink-0 origin-left transition-colors ${
              isSaved ? 'text-brand-600 dark:text-signal' : 'text-unverified'
            }`}
          >
            Nº {String(index + 1).padStart(2, '0')}
          </motion.span>
          {paper.source && (
            <Stamp
              code={SOURCE_STAMPS[paper.source] || paper.source.slice(0, 4)}
              title={SOURCE_LABELS[paper.source] || paper.source}
            />
          )}
          {paper.citationCount > 0 && (
            <span className="shrink-0">{paper.citationCount.toLocaleString()} cited</span>
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {paper.year && <span className="tabular-nums">{paper.year}</span>}
          {/* The bookmark presses in and springs back, the way a physical one
              would. Paired with the call number landing beside it and a tick
              appearing on the spine, one click reads as one event in three
              places — which is the product's argument in miniature. */}
          <motion.button
            data-demo={`save-${index}`}
            onClick={() => toggleSource(paper, query)}
            title={isSaved ? 'Remove from project' : 'Save to project'}
            whileTap={{ scale: 0.82 }}
            animate={isSaved ? { scale: [1, 1.22, 1] } : { scale: 1 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={`transition-colors ${
              isSaved ? 'text-brand-500 dark:text-signal' : 'text-t3 hover:text-brand-500 dark:hover:text-signal'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"
              fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </motion.button>
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

      {/* How well this landed on the topic, on the ranker's own 10-point scale. */}
      {match != null && !compact && (
        <Confidence value={match} title={`Relevance ${paper.relevanceScore}/10`} />
      )}

      {paper.doi && (
        <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer"
          className="record hover:text-brand-600 dark:hover:text-signal transition-colors truncate">
          doi:{paper.doi}
        </a>
      )}

      {/* Stamps: safety first, then role, then access */}
      {(paper.retracted || paper.preprint || (showRole && role) || paper.oa_pdf) && (
        // Tagged so a walkthrough can point at the retraction stamp wherever it
        // lands. Targeting it by position does not work: the results are laid
        // out in role stacks, so DOM order is not array order.
        <div data-demo={paper.retracted ? 'retracted-card' : undefined}
          className="flex items-center flex-wrap gap-1.5">
          {paper.addedByHand && !paper.imported && (
            <Chip
              tone={{ chip: 'text-t2 border-hair/30', dot: 'bg-t3' }}
              label="Added by you"
              title="You added this yourself rather than Firmo finding it. The record is real, the choice was yours."
            />
          )}
          {paper.imported && (
            <Chip
              tone={{ chip: 'text-brand-600 border-brand-500/45 dark:text-signal dark:border-signal/40',
                      dot: 'bg-brand-500 dark:bg-signal' }}
              label="Your file"
              title={paper.filename
                ? `Imported from ${paper.filename}. Firmo did not find this, you supplied it.`
                : 'You supplied this file rather than Firmo finding it.'}
            />
          )}
          {paper.retracted && (
            <Chip
              tone={{ chip: 'text-red-500 border-red-500/50 bg-red-500/10', dot: 'bg-red-500' }}
              label="Retracted · do not cite"
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
          {showRole && role && <Chip tone={role} />}
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

      {/* Firmo's own gloss on the paper. Set in the editorial italic rather
          than in the accent: this is the tool talking, not evidence the
          student holds, and cobalt here would claim a standing it has not
          earned. */}
      {summary && (
        <p className="display-italic text-[12.5px] leading-relaxed text-t2">{summary}</p>
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
        <div className="border-l-2 border-unverified/50 bg-hair/[0.04] rounded-r-record px-3 py-2">
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

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <button onClick={handleCite} disabled={citing} className="btn-ghost">
          {citing ? 'Citing…' : cite ? 'Hide citation' : 'Cite'}
        </button>
        {abstract && !summary && (
          <button data-demo="summarize" onClick={handleSummarize} disabled={busy === 'summary'} className="btn-ghost">
            {busy === 'summary' ? 'Summarizing…' : 'Summarize'}
          </button>
        )}
        {abstract && !why && query && (
          <button data-demo="why-matters" onClick={handleWhy} disabled={busy === 'why'} className="btn-ghost">
            {busy === 'why' ? 'Reading…' : 'Why it matters'}
          </button>
        )}
      </div>
    </motion.article>
  )
}
