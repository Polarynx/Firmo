import { motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { EdgeProgress } from '../ui/primitives'

import SavedPanel from './SavedPanel'
import ClaimInspector from './ClaimInspector'
import ArgumentMap from './ArgumentMap'

// ── The inspector ───────────────────────────────────────────────────────────
//
// The panel is a detail view now, and only a detail view. It used to be the
// whole workspace — Sources, Outline, References and the argument map all lived
// in a 380px column while the middle of the screen held one long scroll of
// everything at once. That is inside out: the thing you are working on belongs
// in the middle, and the thing you are looking at closely belongs beside it.
//
// So each stage owns the centre, and this side answers a narrower question:
// what have I kept, and what is under the cursor. Four faces, no switcher — the
// tabs above the centre decide where you are, and a second row of names beside
// them is how a workspace ends up with two navigations and no map.

const VIEWS = {
  saved:           { label: 'Saved to this paper', Component: SavedPanel },
  claim_inspector: { label: 'This claim',          Component: ClaimInspector },
  argument_map:    { label: 'The argument',        Component: ArgumentMap },
}

export default function ContextSidebar() {
  const view = useUIStore(s => s.sidebarView)
  const isSearching = useResearchStore(s => s.isSearching)
  const busy = useWorkspaceStore(s => s.activeMode !== 'idle')

  const { label, Component } = VIEWS[view] || VIEWS.saved

  return (
    <aside className="panel-recess relative h-full flex flex-col bg-panel border-l border-line overflow-hidden">
      <EdgeProgress active={busy || isSearching} />

      <div className="shrink-0 flex items-baseline gap-2 px-3 py-2.5 border-b border-line">
        <span className="eyebrow !text-t2">{label}</span>
      </div>

      <div className="flex-1 overflow-y-auto scroll-quiet px-3 py-3.5" style={{ perspective: '1400px' }}>
        {/* A leaf turning, not a slide. The panel is one face of a book that has
            several, so it arrives by rotating in about its binding edge on the
            right. Slight, and about a third of a second — enough to read as
            paper, not enough to wait for.

            Deliberately a keyed remount rather than an AnimatePresence with
            `mode="wait"`. That version made the incoming panel wait for the
            outgoing one's exit to report finished, and when the panel being torn
            down owned a `layoutId` the exit could simply never resolve: the
            heading changed, the body did not, and navigation was stuck until
            reload. */}
        <motion.div
          key={view}
          initial={{ opacity: 0, rotateY: -7, x: 12 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ transformOrigin: 'right center' }}
          className="pb-8"
        >
          <Component />
        </motion.div>
      </div>
    </aside>
  )
}
