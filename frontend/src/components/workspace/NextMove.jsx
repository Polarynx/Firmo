import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'

import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { STAGES, readStages, nextMove } from '../../lib/stages'
import { SPRING } from '../../lib/constants'

// ── The next move ───────────────────────────────────────────────────────────
//
// One line, above the page, naming the single most useful thing to do now.
//
// This is what turns five tools into one workflow. Every feature Firmo has
// already existed before this; what did not exist was any thread between them,
// so a student who had just saved fourteen sources was given no reason to think
// an outline was the next thing, or that Firmo could build one. The stages knew.
// Nothing said so.
//
// Two disciplines keep it from becoming noise. It offers nothing once the paper
// is moving under its own steam — `nextMove` returns null far more often than
// it returns a suggestion — and dismissing it is per-suggestion and remembered,
// so a student who has decided they are not outlining yet is not asked again.

export default function NextMove() {
  const setView = useUIStore(s => s.setSidebarView)
  const setSidebarOpen = useUIStore(s => s.setSidebarOpen)
  const [dismissed, setDismissed] = useState(() => new Set())

  // Subscriptions, so the suggestion re-reads whenever the paper changes.
  useWorkspaceStore(s => s.doc)
  useWorkspaceStore(s => s.projects)
  useResearchStore(s => s.results)
  useResearchStore(s => s.brief)
  const busy = useWorkspaceStore(s => s.activeMode !== 'idle')
  useAnnotationStore(s => s.claims)
  useAnnotationStore(s => s.outline)
  useAnnotationStore(s => s.citations)

  const stages = readStages()
  const move = busy ? null : nextMove(stages)
  const show = move && !dismissed.has(move.stage)

  const go = () => {
    const stage = STAGES.find(s => s.key === move.stage)
    if (stage) { setView(stage.view); setSidebarOpen(true) }
  }

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key={move.stage}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.14 } }}
          transition={SPRING}
          className="flex items-center gap-3 rounded-lg border border-hair/[0.08]
            bg-raised/50 px-3.5 py-2.5"
        >
          <span className="w-1 h-1 rounded-full bg-brand-500 dark:bg-signal shrink-0" />
          <p className="text-[12px] text-t2 leading-snug min-w-0 flex-1">{move.text}</p>
          <button
            onClick={go}
            className="shrink-0 text-[11.5px] font-medium text-brand-600 dark:text-signal
              hover:opacity-75 transition-opacity"
          >
            {move.label}
          </button>
          <button
            onClick={() => setDismissed(d => new Set(d).add(move.stage))}
            aria-label="Dismiss"
            className="shrink-0 text-t3 hover:text-t1 transition-colors text-[13px] leading-none px-1"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
