import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useUIStore } from '../../stores/useUIStore'
import { detectIntent, escapeRe, guessShape, placeClaims, INTENT_COPY, MARK_CLASS } from '../../lib/claims'
import { runIntent, cancelActive } from '../../lib/runIntent'
import { SPRING, CLAIM_STATUS, CLAIM_ORDER, EXAMPLE_TOPICS } from '../../lib/constants'
import { Chip, EdgeProgress, StatusLine } from '../ui/primitives'

import BriefBlock from './BriefBlock'
import NextMove from '../workspace/NextMove'
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

// ── The opening sequence ───────────────────────────────────────────────────
// The empty canvas plays once, as one orchestrated take, and ends on the claim
// mark. Everything is timed backwards from that beat: the rule is ruled, the
// title is set line by line, and only then does something read the sentence and
// mark it. Scattered fades arriving together would say nothing; this says what
// the product does before a word of copy is read.
//
// `EASE` is a long, decelerating curve — things here settle like objects coming
// to rest, they do not bounce.
const EASE = [0.16, 1, 0.3, 1]

const HERO = {
  rest: {},
  run: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
}

// The rule is ruled, left to right.
const RULE = {
  rest: { scaleX: 0 },
  run: { scaleX: 1, transition: { duration: 0.7, ease: EASE } },
}

// A line of type rising into its slug. The wrapper clips it.
const LINE = {
  rest: { y: '110%' },
  run: { y: '0%', transition: { duration: 0.75, ease: EASE } },
}

const FADE_UP = {
  rest: { opacity: 0, y: 10 },
  run: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
}

// The claim mark. `clipPath` sweeps the wash and its baseline rule across the
// words left to right — the direction the reader is already travelling — so the
// mark reads as something moving through the sentence rather than appearing on
// top of it. Delayed past the rest of the stagger: it is the closing beat.

// One example, drawn fresh. Not the same one twice in a row within a session,
// because a "try another" that returns what you just saw reads as broken.
let lastExample = null
function pickExample() {
  if (EXAMPLE_TOPICS.length < 2) return EXAMPLE_TOPICS[0]
  let next
  do { next = EXAMPLE_TOPICS[Math.floor(Math.random() * EXAMPLE_TOPICS.length)] }
  while (next === lastExample)
  lastExample = next
  return next
}

export default function DocumentCanvas() {
  const reduceMotion = useReducedMotion()
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
  // A different example every few seconds, unasked.
  //
  // The pool exists to seed ideas while the student is still deciding what to
  // type, and an example behind a button is one most people never see. So it
  // rotates on its own — slowly, and only while nobody is looking at it. The
  // one real hazard is a line that changes mid-read, which the hover pause
  // handles: point at it and it holds still until you leave.
  const [example, setExample] = useState(pickExample)
  const [paused, setPaused] = useState(false)

  const [scrolled, setScrolled] = useState(false)
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

  // Only while the canvas is empty — once there is a draft the hero is gone and
  // the timer would be waking a component nobody can see. Reduced motion stops
  // it outright rather than slowing it: the objection there is movement itself.
  const heroVisible = !doc.trim() && !brief
  useEffect(() => {
    if (!heroVisible || paused || reduceMotion) return
    const id = setInterval(() => setExample(pickExample), 7000)
    return () => clearInterval(id)
  }, [heroVisible, paused, reduceMotion])

  const busy = activeMode !== 'idle'
  const intent = detectIntent(doc)
  const shapeHint = useMemo(() => guessShape(doc), [doc])
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
    noteTyping()
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
            <span className="text-[11px] text-t2 truncate">
              {/* The shape reading wins when there is one. It is the more
                  specific and more useful of the two: "reads like a topic" tells
                  a student nothing they did not know, while "the answer is an
                  effect size, not a yes" is the thing that changes what they
                  write. */}
              {(intent === 'search' && shapeHint?.hint) || INTENT_COPY[intent]?.hint}
            </span>
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

      {/* The room. Both layers sit behind the scrolling page and neither takes
          a pointer event: a pool of warm light over the writing surface, and
          corners that fall away from it. This is what gives the widened ink
          ramp something to be a ramp towards. */}
      <div className="vignette" aria-hidden="true" />
      <div
        className="lamp"
        aria-hidden="true"
        style={{ '--lamp-power': busy ? 0.15 : reading ? 0.06 : 0.10 }}
      />

      <div
        ref={scrollRef}
        onScroll={e => {
          setScrolled(e.currentTarget.scrollTop > 4)
          if (hoveredMark) setHoveredMark(null) // its measured rect just went stale
        }}
        onMouseDown={focusDocument}
        className="relative z-10 flex-1 overflow-y-auto scroll-quiet"
      >
        {/* Clearance for the floating dock AND the desk-edge scrim above it.
            pb-32 was sized for the dock alone; once the page started falling
            into shadow before reaching it, the bottom 210px became a gradient
            and anything ending inside it — the rotating prompt did — was washed
            out to nothing. Content has to finish above the scrim, not just
            above the glass. */}
        {/* The page. Its own stock, a lit top edge and a shadow beneath, so the
            document reads as paper lying on the desk rather than as the desk
            with words on it. The empty state and the brief sit outside it —
            they are Firmo talking, not the student's page. */}
        <div
          onMouseDown={focusDocument}
          className="mx-auto w-full max-w-3xl px-8 pt-12 pb-56 flex flex-col gap-7"
        >

          {/* Empty state: the whole product, asked as one question.
              It unmounts outright instead of exit-animating. An exit would keep
              holding its ~250px of layout while it faded, which shoves the sheet
              down the page — and if the tab is backgrounded mid-fade the browser
              stops the animation and it never lets go at all. */}
          {heroVisible && (
            <motion.div
              variants={HERO}
              // Reduced motion gets the finished frame, not a faster take: the
              // sequence is the point, and half of it is worse than none.
              initial={reduceMotion ? 'run' : 'rest'}
              animate="run"
              className="flex flex-col gap-5 pt-4"
            >
              {/* The masthead of a working paper, not the greeting of a chat
                  app. The old hero asked what you were researching today, which
                  is a question every assistant asks; this one states what the
                  tool is for.

                  The whole block plays as one sequence rather than as six
                  elements fading in together: the rule is ruled, the title is
                  set, and then the claim layer marks the sentence. That last
                  beat is the product, so everything before it is timed to hand
                  over to it. */}
              <div className="pb-3">
                <span className="eyebrow">Firmo — working paper</span>
                <motion.div
                  variants={RULE}
                  className="mt-3 h-px bg-hair/20 origin-left"
                />
              </div>

              {/* Each line is clipped by its own wrapper so the type rises into
                  place, the way a line of metal type drops into a stick. */}
              <h1 className="font-display font-semibold text-[2.6rem] sm:text-[3.5rem]
                leading-[0.98] text-t1 max-w-[15ch]">
                <span className="block overflow-hidden pb-[0.06em]">
                  <motion.span variants={LINE} className="block">Every claim,</motion.span>
                </span>
                <span className="block overflow-hidden pb-[0.06em]">
                  <motion.span variants={LINE} className="block">
                    {/* The full stop lives inside the italic run. Kerning never
                        crosses an element boundary, so a roman period parked
                        after </span> gets no pair with the italic "r" and floats
                        away from it — invisible at 14px, a hole at 56px. */}
                    <span className="display-italic font-normal">accounted for.</span>
                  </motion.span>
                </span>
              </h1>

              <motion.p variants={FADE_UP}
                className="text-[14.5px] text-t2 leading-relaxed max-w-[48ch]">
                Type a topic and Firmo searches sixteen databases. Paste a draft and it
                marks every sentence that needs a source. Paste a reference list and it
                checks each entry against the publisher's record.
              </motion.p>

              {/* One way in, not three, and it changes on its own.
                  A row of three fixed examples reads as a menu of the things
                  Firmo can do; a single line that keeps changing reads as an
                  invitation to ask something of your own. It rotates without
                  being asked because the point is to seed ideas while the
                  student is still deciding — a button they have to press is a
                  button most people never press. */}
              <motion.div variants={FADE_UP}
                className="flex flex-col gap-2 pt-2 border-t border-hair/10"
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
              >
                <span className="record">Try</span>
                <AnimatePresence mode="wait">
                  <motion.button
                    key={example}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => { setDoc(example); runIntent(example, 'search') }}
                    whileHover={{ x: 5 }}
                    className="group flex items-baseline gap-3 py-2 text-left"
                  >
                    <span className="font-display text-[17px] text-t2 group-hover:text-t1
                      transition-colors leading-snug">{example}</span>
                    <span className="ml-auto shrink-0 record opacity-0 group-hover:opacity-100
                      transition-opacity">↵</span>
                  </motion.button>
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )}

          {/* The research brief streams in above the document. */}
          <BriefBlock />

          {/* One line naming the most useful thing to do next, when there is
              one. Above the page rather than beside it, because it is about the
              paper as a whole and not about whatever panel is open. */}
          <NextMove />

          {/* ── The writing surface ──
              It is a page now, not an open field: its own stock, a lit top
              edge, a shadow under it, and a grain fine enough to read as paper
              rather than as noise. The padding is generous because a sheet with
              type running to its edge looks like a div again. */}
          <div className="sheet relative px-7 sm:px-9 py-8">
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
                className="flex flex-col gap-3"
              >
                {/* How far through the draft is. A claim is settled once it no
                    longer asks anything of the student, so a paragraph of pure
                    opinion counts as done rather than as unfinished work. */}
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
