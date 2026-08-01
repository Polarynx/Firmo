import { motion } from 'framer-motion'

import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { STAGES, readStages } from '../../lib/stages'
import { SPRING } from '../../lib/constants'

// ── The stage rail ──────────────────────────────────────────────────────────
//
// One navigation for the whole workspace, and the answer to "I don't know where
// to press". It lists the seven things a paper is made of, in the order they get
// made, and marks how far each one has got.
//
// It replaces three separate ways of moving around: the five-face switcher that
// lived inside the sidebar, the slash commands that existed only because there
// was no other route to those actions, and the implicit ordering a student had
// to infer. None of them showed state, so none of them could answer the only
// question that matters at 2am — what is left.
//
// It sits above the record ticks in the same rail deliberately. Where you are in
// the paper and what you have done to it are the same column, which is what a
// spine is: the outside of the thing, printed with what is inside.
//
// Nothing here is ever disabled. A stage that cannot run yet still opens, and
// says what it needs when it gets there. Locking a step is how a workspace turns
// into a wizard, and a paper is not written front to back.

const DOT = {
  done: 'bg-brand-500 dark:bg-signal',
  part: 'bg-amber-400',
  empty: 'bg-unverified/35',
}

export default function StageRail() {
  const view = useUIStore(s => s.sidebarView)
  const setView = useUIStore(s => s.setSidebarView)
  const setSidebarOpen = useUIStore(s => s.setSidebarOpen)

  // Subscribed rather than read once, so the marks move as the paper does.
  useWorkspaceStore(s => s.doc)
  useWorkspaceStore(s => s.projects)
  useResearchStore(s => s.results)
  useResearchStore(s => s.brief)
  useAnnotationStore(s => s.claims)
  useAnnotationStore(s => s.outline)
  useAnnotationStore(s => s.citations)

  const stages = readStages()

  return (
    <nav className="w-full flex flex-col gap-px px-1 pt-1" aria-label="Stages of this paper">
      {STAGES.map(stage => {
        const st = stages[stage.key] || { state: 'empty' }
        const active = view === stage.view && stage.key !== 'draft' && stage.key !== 'export'
        const title = [
          stage.label,
          st.note || stage.hint,
          st.blocked ? `— ${st.blocked}` : '',
        ].filter(Boolean).join(' · ')

        return (
          <motion.button
            key={stage.key}
            onClick={() => { setView(stage.view); setSidebarOpen(true) }}
            title={title}
            whileTap={{ scale: 0.94 }}
            transition={SPRING}
            className={`group relative w-full py-2 flex flex-col items-center gap-1.5
              rounded transition-colors ${active ? 'bg-hair/[0.05]' : 'hover:bg-hair/[0.03]'}`}
          >
            {/* The mark: filled when the stage is finished, amber while it is
                part-done, hollow while it is still waiting. Shape as well as
                colour, so it survives being 6px wide and colour-blind. */}
            <span
              className={`w-[6px] h-[6px] rounded-full shrink-0 transition-colors
                ${st.state === 'empty' ? 'border border-unverified/50 bg-transparent' : DOT[st.state]}`}
            />
            <span
              className={`record !text-[8.5px] tracking-[0.18em] transition-colors
                ${active ? '!text-t1' : st.state === 'empty' ? '' : '!text-t2'}`}
              style={{ writingMode: 'vertical-rl' }}
            >
              {stage.label}
            </span>
            {st.count != null && (
              <span className="font-mono text-[8px] tabular-nums text-t3">{st.count}</span>
            )}

            {/* The active stage carries a hairline down the rail's edge, so the
                column reads as one object with a position marked on it rather
                than as seven buttons. */}
            {active && (
              <motion.span
                layoutId="stage-marker"
                transition={SPRING}
                className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-brand-500 dark:bg-signal"
              />
            )}
          </motion.button>
        )
      })}
    </nav>
  )
}
