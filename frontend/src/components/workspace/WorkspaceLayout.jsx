import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { SPRING } from '../../lib/constants'

import TopBar from './TopBar'
import DocumentCanvas from '../canvas/DocumentCanvas'
import ContextSidebar from '../sidebar/ContextSidebar'
import OmniBar from '../omnibar/OmniBar'
import Walkthrough from '../Walkthrough'

// ── The workspace ──────────────────────────────────────────────────────────
// Three zones, one screen, no page ever reloads. The window itself never
// scrolls; the canvas and the context panel own their own scroll regions.

export default function WorkspaceLayout() {
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const mobileSidebarOpen = useUIStore(s => s.mobileSidebarOpen)
  const setMobileSidebar = useUIStore(s => s.setMobileSidebar)
  const showWalkthrough = useUIStore(s => s.showWalkthrough)
  const setShowWalkthrough = useUIStore(s => s.setShowWalkthrough)
  const setShowHistory = useUIStore(s => s.setShowHistory)
  const setShowProjects = useUIStore(s => s.setShowProjects)

  const setDoc = useWorkspaceStore(s => s.setDoc)
  const executeSearch = useResearchStore(s => s.executeSearch)

  // A shared ?q= link opens straight into a search.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q) {
      setDoc(q)
      executeSearch(q)
    }
    window.history.replaceState({}, '', window.location.pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Any click outside a header menu closes it.
  useEffect(() => {
    function onDown(e) {
      if (!e.target.closest?.('header')) {
        setShowHistory(false)
        setShowProjects(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [setShowHistory, setShowProjects])

  return (
    <div className="relative h-full w-full flex flex-col bg-app text-t1 overflow-hidden">
      <div className="ambient" aria-hidden="true" />

      <TopBar />

      <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden">
        {/* Zone A, with Zone C floating inside it so the HUD centres over the
            document rather than over the whole window. */}
        <div id="zone-a" className="relative flex-1 min-w-0 flex">
          <DocumentCanvas />
          <OmniBar />
        </div>

        {/* Zone B, desktop */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'clamp(340px, 35vw, 520px)', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={SPRING}
              className="hidden lg:block shrink-0 overflow-hidden"
            >
              <div className="h-full" style={{ width: 'clamp(340px, 35vw, 520px)' }}>
                <ContextSidebar />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Zone B, mobile: the same panel as a sheet */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            key="mobile-sidebar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setMobileSidebar(false) }}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={SPRING}
              className="absolute right-0 top-0 h-full w-full max-w-sm"
            >
              <div className="h-full flex flex-col">
                <button
                  onClick={() => setMobileSidebar(false)}
                  className="shrink-0 self-end m-2 px-3 py-1.5 rounded-md bg-panel border border-line
                    text-[11px] font-medium text-t2"
                >
                  Close
                </button>
                <div className="flex-1 min-h-0">
                  <ContextSidebar />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showWalkthrough && <Walkthrough onClose={() => setShowWalkthrough(false)} />}
    </div>
  )
}
