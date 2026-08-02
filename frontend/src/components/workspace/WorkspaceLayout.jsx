import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { SPRING } from '../../lib/constants'

import TopBar from './TopBar'
import Spine from './Spine'
import StageCenter from '../canvas/StageCenter'
import ContextSidebar from '../sidebar/ContextSidebar'
import OmniBar from '../omnibar/OmniBar'
import Demo from '../Demo'
import ImportSheet from '../sidebar/ImportSheet'
import AuthSheet from './AuthSheet'
import RecordSheet from './RecordSheet'

// ── The workspace ──────────────────────────────────────────────────────────
// Three zones, one screen, no page ever reloads. The window itself never
// scrolls; the canvas and the context panel own their own scroll regions.

export default function WorkspaceLayout() {
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const mobileSidebarOpen = useUIStore(s => s.mobileSidebarOpen)
  const setMobileSidebar = useUIStore(s => s.setMobileSidebar)
  const showWalkthrough = useUIStore(s => s.showWalkthrough)
  const setShowWalkthrough = useUIStore(s => s.setShowWalkthrough)
  const stage = useUIStore(s => s.stage)
  const setShowHistory = useUIStore(s => s.setShowHistory)
  const setShowProjects = useUIStore(s => s.setShowProjects)
  const showImport = useUIStore(s => s.showImport)
  const setShowImport = useUIStore(s => s.setShowImport)
  const showAuth = useUIStore(s => s.showAuth)
  const setShowAuth = useUIStore(s => s.setShowAuth)
  const showRecord = useUIStore(s => s.showRecord)
  const setShowRecord = useUIStore(s => s.setShowRecord)

  // Nothing plays on arrival.
  //
  // The demo used to open itself on a genuine first run, which is the standard
  // move and the wrong one: it takes the screen away from someone who has not
  // yet seen what they are being shown a tour of, and the first thing they
  // learn is where the close button is. So they land on the front page, and the
  // demo is offered rather than played — by the invitation on the page and by a
  // marker on the masthead button that stays until they have used it once.

  const executeSearch = useResearchStore(s => s.executeSearch)

  // A shared ?q= link opens straight into a search.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    // The question, not the draft. A shared link used to write its own topic
    // into page one of the recipient's document.
    if (q) executeSearch(q)
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
      <TopBar />

      <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden">
        {/* The ledger rail. Outside Zone A rather than inside it, because the
            record is about the whole session, not about the document. */}
        <Spine />

        {/* Zone A, with Zone C floating inside it so the HUD centres over the
            document rather than over the whole window. */}
        <div id="zone-a" className="relative flex-1 min-w-0 flex">
          <StageCenter />
          {/* The desk falls into shadow before it reaches the command bar. The
              bar floats over a scrolling page, so without this the last
              paragraph reads straight through the glass. */}
          <div className="desk-edge" aria-hidden="true" />
          {/* The chat stays up during the demo now that the script uses it —
              asking five saved sources where they disagree is one of the beats,
              and it cannot press a control that is not mounted. */}
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

      <AnimatePresence>
        {showImport && <ImportSheet key="import" open onClose={() => setShowImport(false)} />}
        {showAuth && <AuthSheet key="auth" onClose={() => setShowAuth(false)} />}
        {showRecord && <RecordSheet key="record" onClose={() => setShowRecord(false)} />}
      </AnimatePresence>

      {/* The tour is chosen by the room the button was pressed in — the home
          tab gets the full survey, every other tab gets its own.
          NOT keyed on `stage`. It was, and that was the bug behind "the home
          video plays the Sources one": the survey's third beat moves the stage
          to Sources, the key changed, React threw the running player away and
          mounted a fresh one — which then asked `tourFor('sources')` and
          started the Sources tour from the top. The launch stage is captured
          once inside the component instead. */}
      {showWalkthrough && <Demo stage={stage} onClose={() => setShowWalkthrough(false)} />}
    </div>
  )
}
