import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useUIStore } from '../../stores/useUIStore'
import { detectIntent, escapeRe, placeClaims, INTENT_COPY, MARK_CLASS } from '../../lib/claims'
import { runIntent, cancelActive } from '../../lib/runIntent'
import { SPRING, CLAIM_STATUS, CLAIM_ORDER } from '../../lib/constants'
import { Chip, EdgeProgress, StatusLine } from '../ui/primitives'

import BriefBlock from './BriefBlock'
import BibliographyBlock from './BibliographyBlock'

// ── Zone A ─────────────────────────────────────────────────────────────────
// A single writing surface that changes what it means depending on what is on
// it. The student never picks a tool; they put words down and Firmo responds.
//
// There is deliberately no card, no panel, and no input box. The prose sits
// directly on the canvas, because a manuscript framed inside a grey rounded
// rectangle reads as a form field. The only chrome is a slim document rail
// pinned to the top of the zone, which carries the run action so nothing ever
// floats over the words.
//
// Highlights are painted by an overlay stacked exactly on top of the textarea.
// Both share `.canvas-type` metrics, so every mark lands on its own words. The
// overlay ignores the pointer except on the marks themselves, which lets clicks
// fall through to the textarea and keep the caret working while a claim stays
// clickable.

export default function DocumentCanvas() {
  const doc = useWorkspaceStore(s => s.doc)
  const setDoc = useWorkspaceStore(s => s.setDoc)
  const activeMode = useWorkspaceStore(s => s.activeMode)

  const claims = useAnnotationStore(s => s.claims)
  const typos = useAnnotationStore(s => s.typos)
  const meta = useAnnotationStore(s => s.meta)
  const draftLoading = useAnnotationStore(s => s.draftLoading)
  const draftStatus = useAnnotationStore(s => s.draftStatus)
  const draftError = useAnnotationStore(s => s.draftError)
  const selectedClaimId = useAnnotationStore(s => s.selectedClaimId)
  const selectClaim = useAnnotationStore(s => s.selectClaim)
  const updateClaim = useAnnotationStore(s => s.updateClaim)
  const clearDraft = useAnnotationStore(s => s.clearDraft)
  const dismissTypos = useAnnotationStore(s => s.dismissTypos)

  const citeLoading = useAnnotationStore(s => s.citeLoading)
  const citeStatus = useAnnotationStore(s => s.citeStatus)
  const isSearching = useResearchStore(s => s.isSearching)
  const searchStatus = useResearchStore(s => s.statusMsg)
  const brief = useResearchStore(s => s.brief)
  const searchError = useResearchStore(s => s.error)

  const setSidebarView = useUIStore(s => s.setSidebarView)

  const taRef = useRef(null)
  const scrollRef = useRef(null)
  const sectionRef = useRef(null)
  const pasteGuard = useRef(false)
  const [scrolled, setScrolled] = useState(false)
  const [hoveredMark, setHoveredMark] = useState(null)

  const busy = activeMode !== 'idle'
  const intent = detectIntent(doc)
  const placed = useMemo(() => (claims ? placeClaims(doc, claims) : []), [doc, claims])
  const annotated = placed.length > 0

  // Grow the surface with the prose. The overlay is absolutely positioned over
  // this element, so its height has to be driven by the same measurement.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [doc])

  // ⌘/Ctrl+Enter runs the detected action from anywhere in the document.
  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      runIntent(doc)
      return
    }
    // A single topic line behaves like a search box: Enter searches.
    if (e.key === 'Enter' && !e.shiftKey && intent === 'search' && !doc.includes('\n')) {
      e.preventDefault()
      runIntent(doc, 'search')
    }
  }

  // Pasting a draft or a reference list starts the right pass on its own, but
  // only when the paste is the whole document: a blank canvas, or everything
  // selected and replaced. Dropping a quote into the middle of a paragraph in
  // progress must not spend a run, and typing never triggers one either.
  function handlePaste() {
    const ta = taRef.current
    if (!ta || pasteGuard.current) return
    const replacingAll = ta.selectionStart === 0 && ta.selectionEnd === ta.value.length
    if (doc.trim() && !replacingAll) return
    pasteGuard.current = true
    setTimeout(() => {
      pasteGuard.current = false
      const next = taRef.current?.value || ''
      const kind = detectIntent(next)
      if (kind === 'draft' || kind === 'citations') runIntent(next, kind)
    }, 0)
  }

  function handleChange(e) {
    setDoc(e.target.value)
  }

  // Clicking dead space anywhere on the canvas drops the caret at the end of
  // the document, the way Notion and Typora behave. Guarded on the event
  // target so a click on a card, link, or button is left alone.
  function focusDocument(e) {
    if (e.target !== e.currentTarget) return
    const ta = taRef.current
    if (!ta) return
    e.preventDefault()
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
  }

  const counts = placed.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  const segments = useMemo(() => {
    if (!annotated) return null
    const marks = placed.filter(c => c.start >= 0).sort((a, b) => a.start - b.start)
    const out = []
    let cursor = 0
    for (const c of marks) {
      if (c.start > cursor) out.push({ text: doc.slice(cursor, c.start) })
      out.push({ text: doc.slice(c.start, c.end), claim: c })
      cursor = c.end
    }
    out.push({ text: doc.slice(cursor) })
    return out
  }, [doc, placed, annotated])

  function applyTypos() {
    if (!typos?.length) return
    let t = doc
    for (const { from, to } of typos) {
      t = t.replace(new RegExp(`\\b${escapeRe(from)}\\b`, 'g'), to)
    }
    setDoc(t)
    // Keep the highlights pinned: fix the same words inside each claim's quote.
    for (const c of claims || []) {
      let q = c.quote
      for (const { from, to } of typos) {
        q = q.replace(new RegExp(`\\b${escapeRe(from)}\\b`, 'g'), to)
      }
      if (q !== c.quote) updateClaim(c.id, { quote: q })
    }
    dismissTypos()
  }

  const statusText = isSearching ? searchStatus
    : draftLoading ? draftStatus
    : citeLoading ? citeStatus
    : ''

  return (
    <section ref={sectionRef} className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
      <EdgeProgress active={busy} />

      {/* The hovered claim's next move, named. */}
      <AnimatePresence>
        {hoveredMark && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
            transition={SPRING}
            className="inspect-badge"
            style={{ top: hoveredMark.top, right: hoveredMark.right }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              hoveredMark.status === 'shaky' ? 'bg-annot-red' : 'bg-annot-amber'
            }`} />
            Inspect evidence
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document rail: the only chrome the writing surface gets. It is part of
          the layout rather than floating, so it can never sit over the prose. */}
      <div
        className={`relative z-20 shrink-0 h-11 flex items-center justify-between gap-3
          px-5 sm:px-8 bg-app/85 backdrop-blur-xl transition-colors duration-300
          ${scrolled ? 'border-b border-line' : 'border-b border-transparent'}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {statusText ? (
            <StatusLine>{statusText}</StatusLine>
          ) : intent === 'empty' ? (
            <span className="text-[11px] text-t3">
              A topic, a draft, or a bibliography. Firmo reads which.
            </span>
          ) : (
            <span className="text-[11px] text-t2 truncate">{INTENT_COPY[intent]?.hint}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {annotated && !busy && (
            <button onClick={clearDraft} className="btn-ghost">Clear marks</button>
          )}
          {busy ? (
            <button
              onClick={cancelActive}
              className="btn-ghost hover:!border-red-400/60 hover:!text-red-400"
            >
              Stop
            </button>
          ) : (
            <motion.button
              onClick={() => runIntent(doc)}
              disabled={intent === 'empty'}
              whileHover={intent === 'empty' ? undefined : { y: -1 }}
              whileTap={intent === 'empty' ? undefined : { scale: 0.97 }}
              transition={SPRING}
              className="btn-primary text-xs py-1.5"
            >
              {INTENT_COPY[intent]?.verb || 'Run'}
              <span className="ml-2 opacity-55 font-mono text-[10px]">⌘↵</span>
            </motion.button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={e => {
          setScrolled(e.currentTarget.scrollTop > 4)
          if (hoveredMark) setHoveredMark(null) // its measured rect just went stale
        }}
        onMouseDown={focusDocument}
        className="flex-1 overflow-y-auto scroll-quiet"
      >
        {/* pb-32 is the clearance the floating omni-bar needs: the last line of
            a draft has to be able to scroll clear of the glass. */}
        <div
          onMouseDown={focusDocument}
          className="mx-auto w-full max-w-3xl px-8 pt-12 pb-32 flex flex-col gap-7"
        >

          {/* Empty state: the whole product, asked as one question.
              It unmounts outright instead of exit-animating. An exit would keep
              holding its ~250px of layout while it faded, which shoves the sheet
              down the page — and if the tab is backgrounded mid-fade the browser
              stops the animation and it never lets go at all. */}
          {!doc.trim() && !brief && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
              className="flex flex-col gap-3 pt-6"
            >
              <h1 className="font-display font-semibold text-[2.6rem] sm:text-[3.4rem] leading-[1.02] text-t1">
                What are we<br />
                <span className="display-italic text-brand-500">researching</span> today?
              </h1>
              <p className="text-[15px] text-t2 leading-relaxed max-w-[46ch]">
                Type a topic and Firmo searches fifteen databases. Paste a draft and it
                marks every claim that needs backing. Paste a reference list and it checks
                each entry against the publisher's record.
              </p>
            </motion.div>
          )}

          {/* The research brief streams in above the document. */}
          <BriefBlock />

          {/* ── The writing surface: no box, no card, just the page ── */}
          <div className="relative">
            <textarea
              ref={taRef}
              value={doc}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              spellCheck
              placeholder="Start typing, or paste your draft…"
              className={`canvas-type relative z-0 block w-full min-h-[32vh] resize-none
                bg-transparent outline-none border-0 overflow-hidden
                placeholder:text-t3/70 ${annotated ? 'text-transparent' : 'text-t1'}`}
              style={annotated ? { caretColor: 'rgb(var(--accent))' } : undefined}
            />

            {/* Highlight overlay: same metrics, same box, pointer-transparent. */}
            {annotated && (
              <div
                aria-hidden="true"
                className="canvas-type absolute inset-0 z-10 pointer-events-none text-t1 select-none"
              >
                {segments.map((seg, i) => {
                  if (!seg.claim) return <span key={i}>{seg.text}</span>
                  const status = seg.claim.status
                  // Only unresolved claims have evidence left to go and look at.
                  const actionable = status === 'needs_citation' || status === 'shaky'
                  return (
                    <mark
                      key={i}
                      onClick={() => selectClaim(seg.claim.id === selectedClaimId ? null : seg.claim.id)}
                      onMouseEnter={e => {
                        if (!actionable) return
                        // Anchored into the canvas gutter, level with the claim.
                        // Anywhere above or beside the sentence would land on
                        // the neighbouring line and hide the student's words.
                        const r = e.currentTarget.getBoundingClientRect()
                        const zone = sectionRef.current?.getBoundingClientRect()
                        setHoveredMark({
                          status,
                          top: r.top - 2,
                          right: zone ? window.innerWidth - zone.right + 14 : 14,
                        })
                      }}
                      onMouseLeave={() => setHoveredMark(null)}
                      title={(CLAIM_STATUS[status] || CLAIM_STATUS.checking).label}
                      className={`mark-claim ${MARK_CLASS[status] || MARK_CLASS.checking} ${
                        seg.claim.id === selectedClaimId ? 'is-selected' : ''
                      }`}
                    >
                      {seg.text}
                    </mark>
                  )
                })}
                {/* pre-wrap swallows a trailing newline; keep the box honest */}
                <span>{'​'}</span>
              </div>
            )}
          </div>

          {/* Claim summary: the shape of the feedback, at a glance. */}
          <AnimatePresence>
            {claims && claims.length > 0 && (
              <motion.div
                key="counts"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={SPRING}
                className="flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {CLAIM_ORDER.filter(k => counts[k]).map(k => (
                    <Chip key={k} tone={CLAIM_STATUS[k]} count={counts[k]} />
                  ))}
                </div>
                <button
                  onClick={() => setSidebarView('argument_map')}
                  className="text-[11px] font-medium text-brand-500 dark:text-signal hover:opacity-75 transition-opacity"
                >
                  Review the argument →
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {claims && claims.length === 0 && !draftLoading && (
            <p className="text-xs text-t2 leading-relaxed">
              Nothing here needs backing up with evidence. Firmo checks factual claims, not
              opinions or style, so this reads as opinion, narrative, or common knowledge.
            </p>
          )}

          {/* Spelling: offered, never applied behind the student's back. */}
          <AnimatePresence>
            {typos && typos.length > 0 && (
              <motion.div
                key="typos"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={SPRING}
                className="card px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
              >
                <p className="text-[11px] text-t2">
                  {typos.length} spelling fix{typos.length !== 1 ? 'es' : ''} suggested
                  <span className="text-t3">
                    {' · '}{typos.slice(0, 3).map(t => `${t.from} → ${t.to}`).join(', ')}
                    {typos.length > 3 ? '…' : ''}
                  </span>
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={applyTypos} className="btn-primary text-xs py-1.5">Apply</button>
                  <button onClick={dismissTypos} className="btn-ghost">Dismiss</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {meta?.truncated && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Long draft: Firmo checked the first ~
              {Math.round((meta.checkedChars || 0) / 6).toLocaleString()} words this run.
              Paste the rest separately to cover it all.
            </p>
          )}

          {(draftError || (searchError && searchError !== 'invalid_query')) && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-4 py-3
              text-xs text-red-600 dark:text-red-300">
              {draftError || searchError}
            </div>
          )}

          {searchError === 'invalid_query' && (
            <div className="card p-4 flex flex-col gap-1.5">
              <p className="text-sm font-medium text-t1">Firmo needs a research subject</p>
              <p className="text-xs text-t2 leading-relaxed">
                Try a topic ("microplastics in drinking water"), a thesis ("school uniforms
                improve focus"), or a question ("does remote work reduce productivity?").
              </p>
            </div>
          )}

          {/* The works-cited page, assembling itself under the document. */}
          <BibliographyBlock />
        </div>
      </div>
    </section>
  )
}
