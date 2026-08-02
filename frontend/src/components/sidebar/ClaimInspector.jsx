import { useMemo } from 'react'
import { motion } from 'framer-motion'

import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedIds } from '../../stores/selectors'
import { useUIStore } from '../../stores/useUIStore'
import { useRecordStore } from '../../stores/useRecordStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { placeClaims } from '../../lib/claims'
import { inTextCitation } from '../../lib/cite'
import { paperId } from '../../lib/projects'
import { CLAIM_STATUS, SOURCE_LABELS, SPRING } from '../../lib/constants'
import { Chip, EmptyNote, StatusLine } from '../ui/primitives'
import EvidenceDrawer from './EvidenceDrawer'

// View 2: one claim, the evidence for it, and a single button that resolves it.
// "Cite & save" is the whole product in one click — the in-text citation lands
// in the document, the source joins the bibliography, the highlight turns green.

const EXCERPT = 200

function EvidenceRow({ paper, actionLabel, onAction, done, doneLabel }) {
  const authors = Array.isArray(paper.authors) ? paper.authors : []
  const surname = authors.length > 0 ? String(authors[0]).trim().split(' ').pop() : null
  const bits = [
    surname,
    paper.year,
    paper.journal || SOURCE_LABELS[paper.source] || null,
    paper.citationCount > 0 ? `${paper.citationCount.toLocaleString()} cited` : null,
  ].filter(Boolean)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="card px-3 py-2.5 flex flex-col gap-2"
    >
      {paper.url ? (
        <a href={paper.url} target="_blank" rel="noopener noreferrer"
          className="text-[12.5px] font-medium text-t1 leading-snug hover:text-brand-500 dark:hover:text-signal transition-colors">
          {paper.title}
        </a>
      ) : (
        <span className="text-[12.5px] font-medium text-t1 leading-snug">{paper.title}</span>
      )}
      <span className="record">
        {bits.join(' · ')}
        {paper.retracted && <span className="text-red-500 font-medium"> · retracted</span>}
        {!paper.retracted && paper.preprint && <span className="text-amber-500"> · preprint</span>}
      </span>
      {/* A line of the source itself, so the student can judge the match
          without opening the paper. */}
      {paper.abstract && (
        <p className="text-[11px] text-t2 leading-relaxed border-l border-line pl-2">
          {paper.abstract.length > EXCERPT ? `${paper.abstract.slice(0, EXCERPT).trimEnd()}…` : paper.abstract}
        </p>
      )}
      {onAction && (
        <button data-demo="cite" onClick={onAction} disabled={done}
          className={done ? 'btn-ghost self-start' : 'btn-primary text-xs self-start'}>
          {done ? doneLabel : actionLabel}
        </button>
      )}
    </motion.div>
  )
}

export default function ClaimInspector() {
  const doc = useWorkspaceStore(s => s.doc)
  const projectId = useWorkspaceStore(s => s.activeProjectId)
  const ensureProject = useWorkspaceStore(s => s.ensureProject)
  const logRecord = useRecordStore(s => s.log)
  const spliceDoc = useWorkspaceStore(s => s.spliceDoc)
  const style = useWorkspaceStore(s => s.citationStyle)
  const toggleSource = useWorkspaceStore(s => s.toggleSource)
  const savedIds = useSavedIds()

  const claims = useAnnotationStore(s => s.claims)
  const selectedId = useAnnotationStore(s => s.selectedClaimId)
  const updateClaim = useAnnotationStore(s => s.updateClaim)
  const selectClaim = useAnnotationStore(s => s.selectClaim)
  const setSidebarView = useUIStore(s => s.setSidebarView)
  const executeSearch = useResearchStore(s => s.executeSearch)

  const placed = useMemo(() => (claims ? placeClaims(doc, claims) : []), [doc, claims])
  const claim = placed.find(c => c.id === selectedId) || null

  if (!claim) {
    return (
      <EmptyNote title="No claim selected">
        Click any highlighted sentence in your document and the evidence for it appears here.
      </EmptyNote>
    )
  }

  const tone = CLAIM_STATUS[claim.status] || CLAIM_STATUS.checking
  const sources = Array.isArray(claim.sources) ? claim.sources : []
  const pinned = claim.start >= 0

  // Drop the in-text citation in before the sentence's closing punctuation, and
  // save the source in the same action. The claim's stored quote is updated to
  // include the citation, otherwise the highlight loses its sentence on the
  // next render and detaches.
  function cite(paper) {
    const c = inTextCitation(paper, style)
    let newQuote = claim.quote
    if (pinned) {
      const matched = doc.slice(claim.start, claim.end)
      newQuote = /[.!?,;:]/.test(matched.slice(-1))
        ? `${matched.slice(0, -1)} ${c}${matched.slice(-1)}`
        : `${matched} ${c}`
      spliceDoc(claim.start, claim.end, newQuote)
    } else {
      navigator.clipboard?.writeText(c)
    }
    if (!savedIds.has(paperId(paper))) toggleSource(paper)
    updateClaim(claim.id, { status: 'cited', citedAs: c, quote: newQuote })

    // A sentence that needed backing now has it. This is the single most
    // meaningful entry the record can carry, because it is the exact moment a
    // student closed a gap in their own argument.
    logRecord(ensureProject(), 'citation.insert', {
      citation: c,
      title: paper.title || '',
      claim: (claim.claim || claim.quote || '').slice(0, 240),
    })
  }

  function applyRewrite() {
    if (!claim.rewrite) return
    if (pinned) {
      let rw = claim.rewrite
      // Mid-sentence phrases keep the punctuation already in the draft.
      const next = doc[claim.end]
      if (next && /[.,;:!?]/.test(next)) rw = rw.replace(/[.!?]+\s*$/, '')
      spliceDoc(claim.start, claim.end, rw)
      updateClaim(claim.id, { status: 'rewritten', quote: rw })
    } else {
      navigator.clipboard?.writeText(claim.rewrite)
      updateClaim(claim.id, { copied: true })
    }
  }

  return (
    <motion.div
      key={claim.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={SPRING}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <Chip tone={tone} />
        {/* Closing an inspection, not going anywhere. The centre still has the
            sentence on it; this only empties the panel. */}
        <button onClick={() => { selectClaim(null); setSidebarView('argument_map') }}
          className="text-[11px] font-medium text-t3 hover:text-t1 transition-colors">
          Done
        </button>
      </div>

      <blockquote className="border-l-2 border-line pl-3 font-display text-[13.5px] leading-relaxed text-t1">
        {claim.claim || claim.quote}
      </blockquote>

      {!pinned && (
        <p className="text-[10.5px] text-t3">
          Firmo couldn't pin this to an exact sentence, so actions copy to your clipboard instead
          of editing the document.
        </p>
      )}

      {claim.status === 'checking' ? (
        <StatusLine>Finding real sources for this claim…</StatusLine>
      ) : (
        <>
          {claim.explanation && (
            <p className="text-[11.5px] text-t2 leading-relaxed">{claim.explanation}</p>
          )}

          {/* The sentence that actually backs this, if the project's papers
              have been read. Sits above the recommendations, because evidence
              the student already holds outranks a suggestion to go find some. */}
          <EvidenceDrawer claim={claim} projectId={projectId} />

          {claim.status === 'cited' && claim.citedAs && (
            <p className="text-[11.5px] text-brand-600 dark:text-signal leading-relaxed">
              Inserted <span className="font-mono">{claim.citedAs}</span> and saved the source to
              your bibliography.
            </p>
          )}

          {claim.status === 'shaky' && claim.rewrite && (
            <div className="border-l-2 border-l-red-500 bg-red-500/[0.07] rounded-r px-3 py-2.5 flex flex-col gap-2">
              <span className="eyebrow !text-red-500">Suggested rewrite</span>
              <p className="text-[12.5px] text-t1 leading-relaxed">{claim.rewrite}</p>
              <button onClick={applyRewrite} className="btn-primary text-xs self-start">
                {pinned ? 'Use this wording' : claim.copied ? '✓ Copied' : 'Copy rewrite'}
              </button>
            </div>
          )}

          {claim.status === 'backed' && claim.saved_match && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Already in your bibliography</span>
              <EvidenceRow
                paper={claim.saved_match}
                actionLabel={pinned ? 'Insert citation' : 'Copy citation'}
                onAction={() => cite(claim.saved_match)}
              />
            </div>
          )}

          {(claim.status === 'needs_citation' || claim.status === 'shaky') && sources.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">
                {claim.status === 'shaky' ? 'What the evidence says' : 'Sources that back this'}
              </span>
              {sources.map((p, i) => (
                <EvidenceRow
                  key={paperId(p) || i}
                  paper={p}
                  actionLabel={pinned ? 'Cite & save' : 'Copy & save'}
                  onAction={() => cite(p)}
                />
              ))}
            </div>
          )}

          {claim.status === 'needs_citation' && sources.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11.5px] text-t2">No solid sources surfaced for this one.</p>
              <button onClick={() => executeSearch(claim.claim)} className="btn-ghost self-start">
                Search for evidence
              </button>
            </div>
          )}
        </>
      )}

      {/* Move through the remaining work without going back to the document. */}
      <ClaimQueue placed={placed} currentId={claim.id} onPick={selectClaim} />
    </motion.div>
  )
}

function ClaimQueue({ placed, currentId, onPick }) {
  const open = placed.filter(
    c => c.id !== currentId && (c.status === 'needs_citation' || c.status === 'shaky')
  )
  if (open.length === 0) return null
  return (
    <div className="flex flex-col gap-2 pt-3 border-t border-line">
      <span className="eyebrow">Still open · {open.length}</span>
      {open.slice(0, 6).map(c => (
        <button
          key={c.id}
          onClick={() => onPick(c.id)}
          className="text-left card px-3 py-2 flex items-center justify-between gap-2
            hover:border-brand-500/50 transition-colors"
        >
          <span className="text-[11.5px] text-t2 leading-snug line-clamp-2">{c.claim}</span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(CLAIM_STATUS[c.status] || CLAIM_STATUS.checking).dot}`} />
        </button>
      ))}
    </div>
  )
}
