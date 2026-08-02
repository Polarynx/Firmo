import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

import { useResearchStore, selectFiltered } from '../../stores/useResearchStore'
import { useUIStore } from '../../stores/useUIStore'
import { useSavedSources, useSavedIds } from '../../stores/selectors'
import { paperId } from '../../lib/projects'
import { SOURCE_LABELS, ROLE_ORDER, SHAPE, roleFor, SPRING } from '../../lib/constants'
import { EmptyNote, StatusLine } from '../ui/primitives'
import QueryLedger from './QueryLedger'
import SourceCard from './SourceCard'

// ── View 1: the sources workspace ───────────────────────────────────────────
//
// Sixty results used to arrive as one column, four thousand pixels tall, in
// reading order. Everything Firmo knew about how those papers differed was
// spent on a row of filter chips — which is the wrong instrument, because a
// filter shows you one group at a time and hides the shape of the whole. A
// student wanting to know whether they had any null results had to click a
// chip, read, click back, and hold the answer in their head.
//
// So the roles organise the panel instead of filtering it. The evidence is
// laid out in stacks — estimates here, the papers that cut against them there,
// the methods behind both — and the rail at the top jumps between them. That
// is the actual question being asked of this panel at 2am: not "show me only
// the counter-evidence" but "what have I got, and what am I missing".
//
// Two consequences worth keeping. An empty stack is information, so a heading
// with nothing under it is still worth the line it costs — a paper with no
// moderators found is a paper that has not asked whether the effect holds
// everywhere. And the stacks are collapsible, so the panel can be folded down
// to a table of contents once the reading is done.

const SPY_OFFSET = 96   // the rail and the section head, so the spy fires under them

export default function SourcesView() {
  const store = useResearchStore()
  const {
    results, provisional, isSearching, statusMsg,
    questionShape, searchedQuery, showRelated, hiddenSources, moreLoading, error,
  } = store

  const savedSources = useSavedSources()
  const savedIds = useSavedIds()
  const setShowImport = useUIStore(s => s.setShowImport)
  const setStage = useUIStore(s => s.setStage)

  const shape = SHAPE[questionShape]
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [active, setActive] = useState(null)
  const rootRef = useRef(null)
  const headRefs = useRef({})

  const filtered = selectFiltered(store)
  const core = filtered.filter(p => p.tier !== 'related')
  const related = filtered.filter(p => p.tier === 'related')
  const relatedOpen = showRelated || core.length === 0
  const shown = relatedOpen ? [...core, ...related] : core

  // Core first inside every stack, so opening the background drawer appends to
  // each group rather than shuffling the papers already read.
  const groups = ROLE_ORDER.map(key => {
    const papers = shown.filter(p => (p.stance || 'context') === key)
    return {
      key,
      cfg: roleFor(key, questionShape),
      papers,
      saved: papers.filter(p => savedIds.has(paperId(p))).length,
    }
  }).filter(g => g.papers.length > 0)

  // Which stack the reader is in. Scroll position rather than click, so the
  // rail stays honest when they scroll past a heading by hand.
  const groupKeys = groups.map(g => g.key).join('|')

  useEffect(() => {
    const root = rootRef.current?.closest('.overflow-y-auto')
    const keys = groupKeys ? groupKeys.split('|') : []
    if (!root || keys.length === 0) return

    // Read on a frame, write only on a change. Both halves matter: measuring
    // inside the scroll event forces layout on every tick, and calling setState
    // unconditionally re-renders a panel that is itself animating, which moves
    // the sticky headers, which fires scroll again. That loop is what froze the
    // renderer hard enough to time out the debugger.
    let frame = 0
    const measure = () => {
      frame = 0
      const top = root.getBoundingClientRect().top
      let current = keys[0]
      for (const key of keys) {
        const el = headRefs.current[key]
        if (el && el.getBoundingClientRect().top - top <= SPY_OFFSET) current = key
      }
      setActive(prev => (prev === current ? prev : current))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure) }

    measure()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [groupKeys])

  const jump = key => {
    setCollapsed(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)   // jumping to a folded stack unfolds it, or nothing happens
      return next
    })
    requestAnimationFrame(() => {
      headRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const toggle = key => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const sourceCounts = results.reduce((acc, p) => {
    if (p.source) acc[p.source] = (acc[p.source] || 0) + 1
    return acc
  }, {})

  // Nothing searched yet. What is already saved lives in the panel on the right
  // now, at every stage, so repeating it here would be the same list twice on
  // one screen; this says the one thing the surface is missing instead.
  if (results.length === 0 && !isSearching) {
    return (
      <EmptyNote
        title={savedSources.length > 0 ? 'No search running' : 'Nothing found yet'}
        graphic
        action={
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => setStage('question')} className="btn-primary text-xs">
              Ask a question
            </button>
            <button onClick={() => setShowImport(true)} className="btn-ghost">
              Import what you already have
            </button>
          </div>
        }
      >
        {savedSources.length > 0
          ? `You have ${savedSources.length} source${savedSources.length === 1 ? '' : 's'} on the shelf beside you. Search again to add to them.`
          : 'Firmo searches sixteen databases at once and files what comes back by what each paper will do in your argument.'}
      </EmptyNote>
    )
  }

  const totalSaved = shown.filter(p => savedIds.has(paperId(p))).length

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      {isSearching && <StatusLine>{statusMsg}</StatusLine>}

      {/* ── The rail ──────────────────────────────────────────────────────
          Sticky, so it is reachable from anywhere in a long panel. These are
          jumps, not filters: nothing is hidden by pressing one, which is why
          the counts on them can be trusted as a picture of the whole search. */}
      {groups.length > 0 && !provisional && (
        <div className="sticky top-0 z-20 -mx-8 px-8 pt-3 pb-2.5 bg-app/95 backdrop-blur-sm
          border-b border-line flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="eyebrow">
              {shown.length} source{shown.length !== 1 ? 's' : ''}
              {shape && <span className="text-t3"> · {shape.label.toLowerCase()}</span>}
            </span>
            {totalSaved > 0 && (
              <span className="record text-brand-500 dark:text-signal">{totalSaved} in your paper</span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {groups.map(g => {
              const isActive = active === g.key
              return (
                <motion.button
                  key={g.key}
                  transition={SPRING}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => jump(g.key)}
                  title={`Jump to ${g.cfg.label.toLowerCase()}`}
                  className={`relative inline-flex items-center gap-1.5 font-mono text-[9px] font-medium
                    uppercase tracking-[0.14em] px-2 py-0.5 rounded border whitespace-nowrap
                    transition-opacity ${g.cfg.chip} ${isActive ? '' : 'opacity-55 hover:opacity-100'}`}
                >
                  {isActive && (
                    // The alpha is baked into the colour rather than set with
                    // `opacity-[0.14]`. Framer writes `opacity` inline while it
                    // drives a layoutId transition, which beats the utility
                    // class outright — the wash rendered at full strength and
                    // painted a solid block over the label it was meant to sit
                    // behind.
                    <motion.span
                      layoutId="role-pill"
                      transition={SPRING}
                      className="absolute inset-0 rounded bg-current/[0.14]"
                    />
                  )}
                  <span className={`relative w-1.5 h-1.5 rounded-full shrink-0 ${g.cfg.dot}`} />
                  <span className="relative">{g.cfg.label}</span>
                  <span className="relative opacity-60">{g.papers.length}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* What kind of question this is, and what a good answer to it looks
          like. One line, shown once, above everything it governs. */}
      {shape && results.length > 0 && !provisional && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="flex flex-col gap-1 rounded-lg border border-line bg-raised/40 px-3 py-2.5"
        >
          <span className="eyebrow">{shape.label}</span>
          <p className="text-[11px] text-t2 leading-relaxed">{shape.note}</p>
        </motion.div>
      )}

      {/* Database filter */}
      {Object.keys(sourceCounts).length > 1 && !provisional && (
        <details className="group">
          <summary className="eyebrow cursor-pointer list-none select-none hover:text-t2 transition-colors">
            Databases ▸
          </summary>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, count]) => {
              const hidden = hiddenSources.has(src)
              return (
                <button
                  key={src}
                  onClick={() => store.toggleSourceFilter(src)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-all ${
                    hidden
                      ? 'border-line text-t3 line-through'
                      : 'border-line text-t2 hover:border-brand-500/60 hover:text-t1'
                  }`}
                >
                  {SOURCE_LABELS[src] || src} <span className="opacity-60">{count}</span>
                </button>
              )
            })}
            {hiddenSources.size > 0 && (
              <button onClick={store.clearSourceFilters}
                className="text-[10px] font-medium text-brand-500 dark:text-signal">
                Show all
              </button>
            )}
          </div>
        </details>
      )}

      {/* What Firmo is actually doing, rather than three grey rectangles
          pretending to be cards. It stays up through ranking and not only until
          the first provisional results land: the cut from a few hundred
          candidates down to these is the part worth watching, and it happens
          after those first cards appear. */}
      {isSearching && <QueryLedger />}

      {/* Provisional results have not been judged yet, so they have no roles to
          stack. Shown flat, and restacked when the ranker lands. */}
      {provisional && (
        <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
          {core.map((paper, i) => (
            <SourceCard key={paperId(paper) || i} paper={paper} index={i} query={searchedQuery} />
          ))}
        </div>
      )}

      {!provisional && core.length === 0 && related.length > 0 && (
        <p className="text-[11px] text-t2 leading-relaxed">
          Nothing landed squarely on your topic, but here are the closest related sources.
        </p>
      )}

      {/* ── The stacks ────────────────────────────────────────────────────── */}
      {!provisional && groups.map(g => {
        const isShut = collapsed.has(g.key)
        return (
          <section key={g.key} className="flex flex-col gap-2.5">
            <button
              ref={el => { headRefs.current[g.key] = el }}
              onClick={() => toggle(g.key)}
              style={{ scrollMarginTop: SPY_OFFSET }}
              className={`sticky top-[54px] z-10 -mx-8 px-8 py-2 bg-app/95 backdrop-blur-sm
                flex items-center gap-2 text-left group/head ${isShut ? 'deck' : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${g.cfg.dot}`} />
              <span className="eyebrow !text-t1">{g.cfg.label}</span>
              <span className="record">{g.papers.length}</span>
              {g.saved > 0 && (
                <span className="record !text-brand-500 dark:!text-signal">· {g.saved} saved</span>
              )}
              <span className="flex-1 h-px bg-line" />
              <span className={`text-t3 text-[10px] shrink-0 transition-transform
                ${isShut ? '' : 'rotate-90'}`}>▸</span>
            </button>

            {/* No height animation on the stack, deliberately. Every SourceCard
                is a `layout` element, so animating the container's height makes
                each card re-measure, which changes the container's height, which
                re-measures the cards. Twenty of them never settle and the tab
                locks up hard enough to time out the debugger. The cards' own
                layout animation already gives the fold a smooth reflow, and it
                is the one that cannot fight itself. */}
            {!isShut && (
              <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
                {g.papers.map((paper, i) => (
                  <SourceCard
                    key={paperId(paper) || `${g.key}-${i}`}
                    paper={paper}
                    index={i}
                    query={searchedQuery}
                    shape={questionShape}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Related & background: one switch that thickens every stack rather than
          a separate list at the bottom, so a background paper still arrives
          filed under what it does. */}
      {!provisional && related.length > 0 && core.length > 0 && (
        <button
          onClick={() => store.setShowRelated(!relatedOpen)}
          className="w-full glass-quiet hover:border-hair/20 hover:bg-hair/[0.04]
            px-4 py-3 flex flex-col items-center gap-0.5 transition-colors group"
        >
          <span className="text-xs font-medium text-t1 group-hover:text-brand-600 dark:group-hover:text-signal transition-colors">
            {relatedOpen ? `Hide ${related.length} related & background` : `Add ${related.length} related & background`}
          </span>
          <span className="text-[10.5px] text-t3">Tied to your topic but not fully about it</span>
        </button>
      )}

      {!provisional && results.length > 0 && !error && (
        <button onClick={store.findMore} disabled={moreLoading} className="btn-ghost w-full py-2.5">
          {moreLoading ? 'Searching from new angles…' : 'Find more sources'}
        </button>
      )}
    </div>
  )
}
