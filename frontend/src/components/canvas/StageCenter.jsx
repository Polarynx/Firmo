import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { readStages, stageMeta } from '../../lib/stages'
import { EdgeProgress } from '../ui/primitives'

import StageTabs from '../workspace/StageTabs'
import NextMove from '../workspace/NextMove'
import DeviceOnlyNote, { useDeviceAtRisk } from '../workspace/DeviceOnlyNote'
import QuestionSurface from './QuestionSurface'
import DocumentCanvas from './DocumentCanvas'
import ExportSurface from './ExportSurface'
import SurfaceShell from './SurfaceShell'

import SourcesView from '../sidebar/SourcesView'
import OutlineView from '../sidebar/OutlineView'
import CitationAudit from '../sidebar/CitationAudit'

// ── The centre ──────────────────────────────────────────────────────────────
//
// One surface at a time, chosen by the stage tabs above it. This is the change
// the workspace most needed: the middle of the screen used to be every part of
// the paper stacked in one scrolling column — the hero, the brief, the editor,
// the claim counts, the works-cited page — so it never looked like anything in
// particular, and the navigation could only move something in the corner of the
// eye. Now the tabs own the middle, and the middle is only ever one thing.
//
// Draft, Claims and Export are three readings of the same page rather than three
// places, which is why they resolve to the same component with a mode.

function Surface({ stage }) {
  switch (stage) {
    case 'question':
      return <QuestionSurface />

    case 'sources':
      return (
        <SurfaceShell wide eyebrow="Sources" title="What came back">
          <SourcesView />
        </SurfaceShell>
      )

    case 'outline':
      return (
        <SurfaceShell eyebrow="Outline" title="The shape of the argument">
          <OutlineView />
        </SurfaceShell>
      )

    case 'references':
      return (
        <SurfaceShell eyebrow="References" title="Checked against the record">
          <CitationAudit />
        </SurfaceShell>
      )

    case 'export':
      return <ExportSurface />

    case 'draft':
    default:
      return <DocumentCanvas mode="draft" />
  }
}

export default function StageCenter() {
  const stage = useUIStore(s => s.stage)
  const busy = useWorkspaceStore(s => s.activeMode !== 'idle')
  const reduceMotion = useReducedMotion()
  const scrollRef = useRef(null)

  // One notice at a time, in order of consequence: losing the work outranks a
  // suggestion about what to do next.
  const demoRunning = useUIStore(s => s.showWalkthrough)
  const deviceAtRisk = useDeviceAtRisk() && !demoRunning
  const [noteQuiet, setNoteQuiet] = useState(false)
  const atRisk = deviceAtRisk && !noteQuiet

  // Every stage keeps its own scroll position. Coming back to a draft you were
  // halfway down and being thrown to the top of it is the small betrayal that
  // makes tabbed interfaces feel unsafe to leave.
  const offsets = useRef({})
  const prev = useRef(stage)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prev.current !== stage) {
      offsets.current[prev.current] = el.scrollTop
      el.scrollTop = offsets.current[stage] || 0
      prev.current = stage
    }
  }, [stage])

  return (
    <section className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
      <EdgeProgress active={busy} />
      <StageTabs />

      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scroll-quiet">
        {/* A keyed remount rather than an AnimatePresence with `mode="wait"`.
            That version makes the incoming surface wait on the outgoing one's
            exit, and when the surface being torn down owns a `layoutId` — the
            sources rail does — the exit can simply never resolve, leaving the
            tabs moved and the centre stuck on the last screen. Nothing about
            moving around a workspace should be able to hang on an animation. */}
        <motion.div
          key={stage}
          initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.994 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* The notices. Above the surface rather than beside it, because both
              are about the paper as a whole rather than about whatever is on
              screen.

              Strictly one at a time, and the order is the order of consequence:
              losing the work outranks a suggestion about what to do next. Two
              stacked banners is how a workspace starts to feel like a site with
              a cookie policy, and the second one is read by nobody — so the
              next-move line waits its turn rather than competing. */}
          <div className="mx-auto w-full max-w-3xl px-8 pt-4 empty:hidden">
            {atRisk ? <DeviceOnlyNote onQuiet={() => setNoteQuiet(true)} /> : <NextMove />}
          </div>
          <Surface stage={stage} />
        </motion.div>
      </div>
    </section>
  )
}

// Re-exported so callers that only want the state can avoid importing the tree.
export { readStages, stageMeta }
