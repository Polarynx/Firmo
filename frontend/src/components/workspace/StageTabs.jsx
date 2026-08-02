import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { STAGES, readStages } from '../../lib/stages'
import { SPRING } from '../../lib/constants'

// ── The stage tabs ──────────────────────────────────────────────────────────
//
// The workspace's one navigation, and the answer to "I don't know where to
// press". Seven tabs for the seven things a paper is made of, in the order they
// get made, each carrying how far it has got.
//
// It used to be a vertical rail inside the left spine: labels set in 8.5px type
// rotated ninety degrees, with a 6px dot for state. That is a beautiful way to
// print the primary navigation of an application at a size nobody can read, and
// two of its seven entries — Draft and Export — pointed at a panel that had
// nothing to do with them, so pressing them lied. Horizontally there is room for
// the label, the count and the mark at sizes that survive being looked at.
//
// It lives inside the centre column rather than spanning the window on purpose.
// A strip that runs the full width reads as application chrome, and switching
// application chrome implies the whole screen changes — including the panel on
// the right, which it does not. Sitting over the centre alone, it reads as what
// it is: the tabs belonging to the surface underneath it.
//
// Nothing here is ever disabled. A stage that cannot run yet still opens and
// says what it needs when it gets there. Locking a step is how a workspace turns
// into a wizard, and a paper is not written front to back.

const DOT = {
  done: 'bg-brand-500 dark:bg-signal',
  part: 'bg-amber-400',
  empty: 'bg-transparent border border-unverified/45',
}

export default function StageTabs() {
  const stage = useUIStore(s => s.stage)
  const setStage = useUIStore(s => s.setStage)
  const stripRef = useRef(null)

  // Subscribed rather than read once, so the marks move as the paper does.
  useWorkspaceStore(s => s.doc)
  useWorkspaceStore(s => s.projects)
  useResearchStore(s => s.results)
  useResearchStore(s => s.brief)
  useAnnotationStore(s => s.claims)
  useAnnotationStore(s => s.outline)
  useAnnotationStore(s => s.citations)

  const stages = readStages()

  // Alt+1 … Alt+7, in the order a paper is made.
  //
  // Not ⌘1/Ctrl+1, which was the obvious choice and the wrong one: those are the
  // browser's own tab switcher on every platform, handled above the page, so
  // `preventDefault` never gets the chance and pressing "go to Sources" would
  // have thrown the student out of Firmo entirely. Alt is free.
  useEffect(() => {
    function onKey(e) {
      if (!e.altKey || e.metaKey || e.ctrlKey) return
      // `e.key` under Alt is the composed character on some layouts, so the
      // digit has to come from the physical key.
      const n = Number((e.code || '').replace('Digit', ''))
      if (!n || n < 1 || n > STAGES.length) return
      e.preventDefault()
      setStage(STAGES[n - 1].key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setStage])

  // Below `lg` the strip scrolls rather than collapsing into a menu. A hidden
  // navigation is the problem this component exists to solve; hiding it again at
  // 900px would just move the problem to smaller screens.
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [stage])

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Stages of this paper"
      className="relative z-20 shrink-0 flex items-stretch gap-0.5 px-3 sm:px-5
        overflow-x-auto no-scrollbar border-b border-hair/[0.07] bg-app/80 backdrop-blur-xl"
    >
      {STAGES.map((s, i) => {
        const st = stages[s.key] || { state: 'empty' }
        const active = stage === s.key
        const title = [s.hint, st.blocked ? `— ${st.blocked}` : ''].filter(Boolean).join(' ')

        return (
          <button
            key={s.key}
            role="tab"
            aria-selected={active}
            data-active={active}
            data-demo={`tab-${s.key}`}
            onClick={() => setStage(s.key)}
            title={`${title}   ⌥${i + 1}`}
            className={`group relative shrink-0 flex items-center gap-2 px-3 py-2.5
              rounded-t transition-colors
              ${active ? 'text-t1' : 'text-t3 hover:text-t2 hover:bg-hair/[0.035]'}`}
          >
            {/* The thread between the marks. Seven dots in a row are seven
                unrelated lights; one rule running behind them is a process with
                positions on it, and the segment behind a finished stage is
                inked while the rest stays faint. It is drawn per-tab rather
                than as one element across the strip so it survives the strip
                scrolling and the labels being different widths. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-3 h-px transition-colors
                  ${st.state === 'empty' ? 'bg-hair/10' : 'bg-brand-500/40 dark:bg-signal/40'}`}
                style={{ marginLeft: '-6px' }}
              />
            )}

            {/* Shape as well as colour, so the three states survive a
                colour-blind reader and a 6px mark. A stage that has just
                finished gives one pulse — the only moment in the strip where
                something moves on its own, spent on the one event worth
                noticing. */}
            <motion.span
              key={`${s.key}-${st.state}`}
              initial={st.state === 'done' ? { scale: 0.4 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className={`w-[6px] h-[6px] rounded-full shrink-0 transition-colors
                ${DOT[st.state] || DOT.empty}`}
            />
            <span className="text-[12.5px] font-medium tracking-tight whitespace-nowrap">
              {s.label}
            </span>
            {st.count != null && (
              <span className={`font-mono text-[10px] tabular-nums transition-colors
                ${active ? 'text-t2' : 'text-t3/70'}`}>
                {st.count}
              </span>
            )}

            {/* One rule slides between tabs rather than seven rules fading in
                and out, so the strip reads as a single object with a position
                marked on it. */}
            {active && (
              <motion.span
                layoutId="stage-underline"
                transition={SPRING}
                className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full
                  bg-brand-500 dark:bg-signal"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
