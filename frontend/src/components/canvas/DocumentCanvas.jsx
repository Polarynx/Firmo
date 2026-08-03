import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useUIStore } from '../../stores/useUIStore'
import { escapeRe, placeClaims, MARK_CLASS } from '../../lib/claims'
import { runIntent, cancelActive } from '../../lib/runIntent'
import { SPRING, CLAIM_STATUS, CLAIM_ORDER } from '../../lib/constants'
import { Chip, StatusLine } from '../ui/primitives'

import BibliographyBlock from './BibliographyBlock'
import SurfaceShell from './SurfaceShell'

// ── The page ────────────────────────────────────────────────────────────────
//
// The student's own writing, and nothing else. This component used to be the
// entire centre of the workspace — the hero, the research brief, the editor, the
// claim counts and the works-cited page stacked in one scrolling column — which
// is how a blank paper and a finished one ended up being the same screen at
// different scroll offsets. Everything that was Firmo talking has moved to its
// own stage. What is left is the sheet.
//
// Draft and Claims are the same page read two ways rather than two places, so
// they are one component with a `mode`. Claims are marks *on* this text; giving
// them a separate editor would mean two copies of the caret.
//
// Highlights are painted by an overlay stacked exactly on top of the textarea.
// Both share `.canvas-type` metrics, so every mark lands on its own words. The
// overlay ignores the pointer except on the marks themselves, which lets clicks
// fall through to the textarea and keep the caret working while a claim stays
// clickable.

export default function DocumentCanvas({ mode = 'draft' }) {
  // Writing and checking are one activity interleaved: write a paragraph, check
  // it, fix it, write the next. They used to be two tabs, which put a navigation
  // between two halves of one motion. Now the marks are a toggle on the page,
  // off while composing because a paragraph covered in amber is a paragraph
  // being argued with before it is finished, and on the moment you want to know
  // what is still unbacked.
  const [showMarks, setShowMarks] = useState(true)
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

  const setSidebarView = useUIStore(s => s.setSidebarView)
  const setStage = useUIStore(s => s.setStage)

  const taRef = useRef(null)
  const sectionRef = useRef(null)
  const pasteGuard = useRef(false)

  const [hoveredMark, setHoveredMark] = useState(null)

  // Focus dimming. While the student is actually writing, the lamp tightens and
  // the room falls back; it comes up again once they stop. The delay is long on
  // purpose — a light that reacts to every keystroke is a light that flickers,
  // and the effect only means anything if it settles.
  const [reading, setReading] = useState(false)
  const readTimer = useRef(null)
  const noteTyping = () => {
    setReading(true)
    clearTimeout(readTimer.current)
    readTimer.current = setTimeout(() => setReading(false), 12000)
  }
  useEffect(() => () => clearTimeout(readTimer.current), [])

  // A finished check turns the marks on. Running one and seeing nothing change
  // is the worst possible outcome of pressing a button called "Check the draft".
  const claimCount = claims?.length ?? 0
  useEffect(() => { if (claimCount) setShowMarks(true) }, [claimCount])

  const busy = activeMode !== 'idle'
  const placed = useMemo(() => (claims ? placeClaims(doc, claims) : []), [doc, claims])
  // Marks only exist on the Claims reading of the page. On Draft the student is
  // writing, and a paragraph already covered in amber is a paragraph being
  // argued with while it is still being composed.
  const annotated = mode !== 'export' && showMarks && placed.length > 0

  // Grow the surface with the prose. The overlay is absolutely positioned over
  // this element, so its height has to be driven by the same measurement.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [doc, mode])

  // ⌘/Ctrl+Enter runs the check from anywhere in the document.
  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (doc.trim()) runIntent(doc, 'draft')
    }
  }

  // Pasting a whole draft starts the check on its own, but only when the paste
  // is the whole document: a blank page, or everything selected and replaced.
  // Dropping a quote into the middle of a paragraph in progress must not spend a
  // run, and typing never triggers one either.
  function handlePaste() {
    const ta = taRef.current
    if (!ta || pasteGuard.current) return
    const replacingAll = ta.selectionStart === 0 && ta.selectionEnd === ta.value.length
    if (doc.trim() && !replacingAll) return
    pasteGuard.current = true
    setTimeout(() => {
      pasteGuard.current = false
      const next = taRef.current?.value || ''
      if (next.trim().split(/\s+/).length > 40) runIntent(next, 'draft')
    }, 0)
  }

  function handleChange(e) {
    setDoc(e.target.value)
    noteTyping()
  }

  // Clicking dead space anywhere on the page drops the caret at the end of the
  // document, the way Notion and Typora behave. Guarded on the event target so a
  // click on a card, link, or button is left alone.
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

  // Settled = asks nothing further of the student. Everything except the two
  // colours that mean "go and do something about this", and the pass in flight.
  const SETTLED = ['backed', 'cited', 'rewritten', 'fine', 'unchecked']
  const settled = placed.filter(c => SETTLED.includes(c.status)).length

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

  const words = doc.trim() ? doc.trim().split(/\s+/).length : 0

  return (
    <div ref={sectionRef} className="relative flex flex-col">
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

      {/* The room. Both layers sit behind the page and neither takes a pointer
          event: a pool of warm light over the writing surface, and corners that
          fall away from it. */}
      <div className="vignette" aria-hidden="true" />
      <div
        className="lamp"
        aria-hidden="true"
        style={{ '--lamp-power': busy ? 0.15 : reading ? 0.06 : 0.10 }}
      />

      <div
        onMouseDown={focusDocument}
        className="relative z-10 mx-auto w-full max-w-3xl px-8 pt-8 pb-56 flex flex-col gap-6"
      >
        {/* One line of chrome, and it belongs to the page rather than floating
            over it. What it offers depends on which reading you are on. */}
        <div className="flex items-center justify-between gap-3">
          <span className="record">
            {draftLoading ? '' : words
              ? `${words.toLocaleString()} word${words === 1 ? '' : 's'}`
                + (placed.length ? ` · ${settled} of ${placed.length} settled` : '')
              : 'Draft'}
          </span>
          {draftLoading && <StatusLine>{draftStatus}</StatusLine>}

          <div className="flex items-center gap-2">
            {placed.length > 0 && !busy && (
              <button
                data-demo="toggle-marks"
                onClick={() => setShowMarks(m => !m)}
                className="btn-ghost"
                title={showMarks ? 'Hide the marks and write' : 'Show what still needs a source'}
              >
                {showMarks ? 'Hide marks' : `Show ${placed.length} marks`}
              </button>
            )}
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
                data-demo="check-draft"
                onClick={() => runIntent(doc, 'draft')}
                disabled={!doc.trim()}
                whileHover={doc.trim() ? { y: -1 } : undefined}
                whileTap={doc.trim() ? { scale: 0.97 } : undefined}
                transition={SPRING}
                className="btn-primary text-xs py-1.5"
              >
                {claims ? 'Re-check the draft' : 'Check the draft'}
                <span className="ml-2 opacity-55 font-mono text-[10px]">⌘↵</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* ── The writing surface ──
            Its own stock, a lit top edge, a shadow under it, and a grain fine
            enough to read as paper rather than as noise. The padding is generous
            because a sheet with type running to its edge looks like a div. */}
        <div className="sheet relative px-7 sm:px-9 py-8">
          <textarea
            ref={taRef}
            data-demo="draft-field"
            value={doc}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            spellCheck
            placeholder="Start typing, or paste your draft…"
            className={`canvas-type relative z-0 block w-full min-h-[42vh] resize-none
              bg-transparent outline-none border-0 overflow-hidden
              placeholder:text-t3/70 ${annotated ? 'text-transparent' : 'text-t1'}`}
            style={annotated ? { caretColor: 'rgb(var(--accent))' } : undefined}
          />

          {/* Highlight overlay: same metrics, same box, pointer-transparent. */}
          {annotated && (
            <div
              aria-hidden="true"
              className="canvas-type absolute inset-0 z-10 pointer-events-none text-t1 select-none
                px-7 sm:px-9 py-8"
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
                      // Anchored into the gutter, level with the claim. Anywhere
                      // above or beside the sentence would land on the
                      // neighbouring line and hide the student's words.
                      const r = e.currentTarget.getBoundingClientRect()
                      const zone = sectionRef.current?.getBoundingClientRect()
                      setHoveredMark({
                        status,
                        top: r.top - 2,
                        right: zone ? window.innerWidth - zone.right + 14 : 14,
                      })
                    }}
                    onMouseLeave={() => setHoveredMark(null)}
                    data-demo={actionable ? 'claim-open' : undefined}
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

        {/* How far through the draft is. A claim is settled once it no longer
            asks anything of the student, so a paragraph of pure opinion counts
            as done rather than as unfinished work. */}
        {showMarks && placed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="confidence-track flex-1">
                <motion.div
                  className="confidence-fill w-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: settled / placed.length }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="font-mono text-[10px] text-t2 tabular-nums shrink-0">
                {settled} of {placed.length} settled
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap items-center gap-1.5">
                {CLAIM_ORDER.filter(k => counts[k]).map(k => (
                  <Chip key={k} tone={CLAIM_STATUS[k]} count={counts[k]} />
                ))}
              </div>
              <button
                onClick={() => setSidebarView('argument_map')}
                className="text-[11px] font-medium text-brand-600 dark:text-signal hover:opacity-75 transition-opacity"
              >
                Review the argument →
              </button>
            </div>
          </motion.div>
        )}

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

        {draftError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-4 py-3
            text-xs text-red-600 dark:text-red-300">
            {draftError}
          </div>
        )}

        {/* The works-cited page, assembling itself under the document. It is
            part of the paper, so it belongs under the paper — but only on the
            Draft reading. On Claims the subject is the prose. */}
        <BibliographyBlock />
      </div>
    </div>
  )
}
