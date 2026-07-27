import { AnimatePresence, motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { SPRING } from '../../lib/constants'
import { EdgeProgress } from '../ui/primitives'

import SourcesView from './SourcesView'
import ClaimInspector from './ClaimInspector'
import ArgumentMap from './ArgumentMap'
import CitationAudit from './CitationAudit'
import OutlineView from './OutlineView'

// ── Zone B ─────────────────────────────────────────────────────────────────
// One panel that follows the work. It does not have tabs so much as faces:
// whatever the student just did in the document decides which one is showing,
// and the row of names is there for when they want to look somewhere else.

const VIEWS = [
  { key: 'sources',         label: 'Sources',   Component: SourcesView },
  { key: 'claim_inspector', label: 'Claim',     Component: ClaimInspector },
  { key: 'argument_map',    label: 'Argument',  Component: ArgumentMap },
  { key: 'citation_audit',  label: 'Audit',     Component: CitationAudit },
  { key: 'outline',         label: 'Outline',   Component: OutlineView },
]

export default function ContextSidebar() {
  const view = useUIStore(s => s.sidebarView)
  const setView = useUIStore(s => s.setSidebarView)

  const results = useResearchStore(s => s.results.length)
  const isSearching = useResearchStore(s => s.isSearching)
  const claims = useAnnotationStore(s => s.claims)
  const selectedClaimId = useAnnotationStore(s => s.selectedClaimId)
  const citations = useAnnotationStore(s => s.citations)
  const outline = useAnnotationStore(s => s.outline)
  const busy = useWorkspaceStore(s => s.activeMode !== 'idle')

  const badges = {
    sources: results || null,
    claim_inspector: null,
    argument_map: claims?.length || null,
    citation_audit: citations?.length || null,
    outline: outline?.length || null,
  }

  // A face is offered when it has something to say, or is the one in view.
  const available = VIEWS.filter(v => {
    if (v.key === view) return true
    if (v.key === 'sources') return true
    if (v.key === 'claim_inspector') return !!selectedClaimId
    if (v.key === 'argument_map') return !!claims
    if (v.key === 'citation_audit') return !!citations
    if (v.key === 'outline') return !!outline
    return false
  })

  const Active = VIEWS.find(v => v.key === view)?.Component || SourcesView

  return (
    <aside className="relative h-full flex flex-col bg-panel border-l border-line overflow-hidden">
      <EdgeProgress active={busy || isSearching} />

      {/* Face switcher */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2.5 border-b border-line overflow-x-auto no-scrollbar">
        {available.map(v => {
          const active = v.key === view
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`relative px-2.5 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap
                transition-colors ${active ? 'text-t1' : 'text-t3 hover:text-t2'}`}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-face"
                  transition={SPRING}
                  className="absolute inset-0 rounded-md bg-raised border border-line"
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {v.label}
                {badges[v.key] != null && (
                  <span className="font-mono text-[9px] text-t3 tabular-nums">{badges[v.key]}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* The face itself */}
      <div className="flex-1 overflow-y-auto scroll-quiet px-3 py-3.5">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12, transition: { duration: 0.12 } }}
            transition={SPRING}
            className="pb-8"
          >
            <Active />
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  )
}
