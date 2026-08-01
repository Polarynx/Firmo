import { motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { SPRING } from '../../lib/constants'
import { EdgeProgress } from '../ui/primitives'

import BriefView from './BriefView'
import SourcesView from './SourcesView'
import ClaimInspector from './ClaimInspector'
import ArgumentMap from './ArgumentMap'
import CitationAudit from './CitationAudit'
import OutlineView from './OutlineView'

// ── Zone B ─────────────────────────────────────────────────────────────────
// One panel that follows the work. It does not have tabs so much as faces:
// whatever the student just did in the document decides which one is showing,
// and the row of names is there for when they want to look somewhere else.

// The stage rail decides which of these is showing. There is no switcher here
// any more: a second row of tabs beside a rail that already names the same
// places is how a workspace ends up with two navigations and no map.
const VIEWS = [
  { key: 'brief',           label: 'Question',  Component: BriefView },
  { key: 'sources',         label: 'Sources',   Component: SourcesView },
  { key: 'claim_inspector', label: 'Claim',     Component: ClaimInspector },
  { key: 'argument_map',    label: 'Claims',    Component: ArgumentMap },
  { key: 'citation_audit',  label: 'References',Component: CitationAudit },
  { key: 'outline',         label: 'Outline',   Component: OutlineView },
]

export default function ContextSidebar() {
  const view = useUIStore(s => s.sidebarView)
  const setView = useUIStore(s => s.setSidebarView)

  const isSearching = useResearchStore(s => s.isSearching)
  const busy = useWorkspaceStore(s => s.activeMode !== 'idle')

  const Active = VIEWS.find(v => v.key === view)?.Component || SourcesView
  const title = VIEWS.find(v => v.key === view)?.label || 'Sources'

  return (
    <aside className="panel-recess relative h-full flex flex-col bg-panel border-l border-line overflow-hidden">
      <EdgeProgress active={busy || isSearching} />

      {/* A heading, not a switcher. Which panel is showing is decided by the
          stage rail on the far side of the window; this only has to say which
          one arrived, so the student can connect the two. */}
      <div className="shrink-0 flex items-baseline gap-2 px-3 py-2.5 border-b border-line">
        <span className="eyebrow !text-t2">{title}</span>
      </div>

      {/* The face itself */}
      <div className="flex-1 overflow-y-auto scroll-quiet px-3 py-3.5" style={{ perspective: '1400px' }}>
        {/* A leaf turning, not a slide.
            The panel is one face of a book that has several, so it arrives by
            rotating in about its binding edge on the right. Slight, and about a
            third of a second — enough to read as paper, not enough to wait for.

            Deliberately a keyed remount rather than an AnimatePresence with
            `mode="wait"`. That version made the incoming panel wait for the
            outgoing one's exit to report finished, and when the panel being
            torn down owned a `layoutId` — the sources rail does — the exit
            could simply never resolve. The heading changed, the body did not,
            and navigation was stuck until reload. Nothing about moving between
            stages should be able to hang on an animation completing. */}
        <motion.div
          key={view}
          initial={{ opacity: 0, rotateY: -7, x: 12 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ transformOrigin: 'right center' }}
          className="pb-8"
        >
          <Active />
        </motion.div>
      </div>
    </aside>
  )
}
