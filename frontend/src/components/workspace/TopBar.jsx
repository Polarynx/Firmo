import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useUIStore } from '../../stores/useUIStore'
import { CITATION_STYLES, SPRING } from '../../lib/constants'
import { IconButton } from '../ui/primitives'

// The masthead: which paper you are working on, what style it is being
// formatted in, and what Firmo is doing right now.

const STATUS_COPY = {
  idle: 'Ready',
  searching: 'Searching',
  draft_checking: 'Checking draft',
  citation_auditing: 'Verifying',
}

export default function TopBar() {
  const projects = useWorkspaceStore(s => s.projects)
  const activeId = useWorkspaceStore(s => s.activeProjectId)
  const active = projects.find(p => p.id === activeId) || null
  const selectProject = useWorkspaceStore(s => s.selectProject)
  const createProject = useWorkspaceStore(s => s.createProject)
  const deleteProject = useWorkspaceStore(s => s.deleteProject)

  const history = useResearchStore(s => s.history)
  const clearHistory = useResearchStore(s => s.clearHistory)
  const executeSearch = useResearchStore(s => s.executeSearch)

  const setDoc = useWorkspaceStore(s => s.setDoc)
  const clearDraft = useAnnotationStore(s => s.clearDraft)

  const theme = useUIStore(s => s.theme)
  const toggleTheme = useUIStore(s => s.toggleTheme)
  const setShowWalkthrough = useUIStore(s => s.setShowWalkthrough)
  const showHistory = useUIStore(s => s.showHistory)
  const setShowHistory = useUIStore(s => s.setShowHistory)
  const showProjects = useUIStore(s => s.showProjects)
  const setShowProjects = useUIStore(s => s.setShowProjects)
  const toggleSidebar = useUIStore(s => s.toggleSidebar)
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const setMobileSidebar = useUIStore(s => s.setMobileSidebar)

  const citationStyle = useWorkspaceStore(s => s.citationStyle)
  const setCitationStyle = useWorkspaceStore(s => s.setCitationStyle)
  const activeMode = useWorkspaceStore(s => s.activeMode)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [styleMenu, setStyleMenu] = useState(false)
  const styleRef = useRef(null)

  // The workspace-wide outside-click handler only closes the store-backed
  // menus, so this one dismisses itself.
  useEffect(() => {
    if (!styleMenu) return
    function onDown(e) {
      if (!styleRef.current?.contains(e.target)) setStyleMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [styleMenu])

  function create() {
    const n = name.trim()
    if (!n) return
    createProject(n)
    setName('')
    setNaming(false)
    setShowProjects(false)
  }

  return (
    <header className="relative z-30 shrink-0 h-12 flex items-center justify-between gap-3
      px-3 sm:px-4 border-b border-line bg-panel/80 backdrop-blur-xl">

      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => { setDoc(''); clearDraft() }}
          title="New document"
          className="font-display font-bold text-lg tracking-tight text-t1 hover:opacity-70 transition-opacity shrink-0"
        >
          Firmo
        </button>

        <span className="text-line select-none">/</span>

        {/* Project switcher */}
        <div className="relative min-w-0">
          <button
            onClick={() => setShowProjects(!showProjects)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[12.5px] font-medium
              text-t2 hover:text-t1 hover:bg-raised transition-colors min-w-0"
          >
            <span className="truncate max-w-[36vw] sm:max-w-[240px]">
              {active ? active.name : 'No paper yet'}
            </span>
            {active && (
              <span className="font-mono text-[10px] text-t3 shrink-0">{active.sources.length}</span>
            )}
            <span className="text-t3 text-[9px] shrink-0">▾</span>
          </button>

          <AnimatePresence>
            {showProjects && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={SPRING}
                className="absolute left-0 top-10 z-40 glass p-1.5 flex flex-col gap-0.5 w-[280px]"
              >
                {projects.length === 0 && (
                  <p className="px-2.5 py-2 text-[11px] text-t3 leading-relaxed">
                    Create a project for the paper you're writing. Every source you save lands
                    in it, and its works-cited page builds itself.
                  </p>
                )}
                {projects.map(p => (
                  <div key={p.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => { selectProject(p.id); setShowProjects(false) }}
                      className={`flex-1 text-left px-2.5 py-1.5 rounded-md text-[12px] transition-colors
                        flex items-center justify-between gap-2 ${
                          p.id === activeId ? 'bg-raised text-t1' : 'text-t2 hover:bg-raised/70 hover:text-t1'
                        }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-t3 shrink-0">{p.sources.length}</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete "${p.name}" and its ${p.sources.length} saved sources?`)) {
                          deleteProject(p.id)
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 px-1.5 text-t3 hover:text-red-400
                        transition-all text-xs"
                      title="Delete project"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className="pt-1 mt-1 border-t border-line">
                  {naming ? (
                    <div className="flex gap-1.5 p-1">
                      <input
                        autoFocus
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') create()
                          if (e.key === 'Escape') setNaming(false)
                        }}
                        placeholder="e.g. PSYC100 sleep essay"
                        className="flex-1 min-w-0 rounded-md border border-line bg-app/60 px-2 py-1.5
                          text-[11.5px] text-t1 placeholder:text-t3 outline-none focus:ring-2 focus:ring-brand-500/40"
                      />
                      <button onClick={create} disabled={!name.trim()} className="btn-primary text-[11px] py-1 px-2.5">
                        Create
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setNaming(true)}
                      className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] font-medium
                        text-brand-500 dark:text-signal hover:bg-raised transition-colors"
                    >
                      + New paper
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">

        {/* Active citation style: everything Firmo formats answers to this. */}
        <div ref={styleRef} className="relative hidden sm:block">
          <button
            onClick={() => setStyleMenu(m => !m)}
            title="Citation style"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium
              text-t2 hover:text-t1 hover:bg-raised transition-colors"
          >
            <span className="font-mono text-[10px] text-brand-500">
              {CITATION_STYLES.find(s => s.key === citationStyle)?.label || 'APA 7'}
            </span>
            <span className="text-t3 text-[9px]">▾</span>
          </button>
          <AnimatePresence>
            {styleMenu && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={SPRING}
                className="absolute right-0 top-9 z-40 glass p-1 flex flex-col min-w-[140px]"
              >
                {CITATION_STYLES.map(s => (
                  <button
                    key={s.key}
                    onClick={() => { setCitationStyle(s.key); setStyleMenu(false) }}
                    className={`text-left text-[11.5px] px-2.5 py-1.5 rounded transition-colors ${
                      s.key === citationStyle
                        ? 'bg-raised text-t1'
                        : 'text-t2 hover:bg-raised/70 hover:text-t1'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* System status: what Firmo is doing right now, always visible. */}
        <div
          title={STATUS_COPY[activeMode] || 'Ready'}
          className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md"
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            activeMode === 'idle' ? 'bg-t3' : 'bg-brand-500 animate-pulseDot'
          }`} />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-t3">
            {STATUS_COPY[activeMode] || 'Ready'}
          </span>
        </div>

        <span className="w-px h-4 bg-line mx-0.5" aria-hidden="true" />

        {/* Search history */}
        <div className="relative">
          <IconButton label="Recent searches" active={showHistory} onClick={() => setShowHistory(!showHistory)}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </IconButton>
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={SPRING}
                className="absolute right-0 top-10 z-40 glass w-[320px] max-h-[60vh] overflow-y-auto scroll-quiet"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-line sticky top-0 bg-panel/80 backdrop-blur-xl">
                  <span className="eyebrow">Recent searches</span>
                  {history.length > 0 && (
                    <button onClick={clearHistory} className="text-[11px] text-t3 hover:text-red-400 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <p className="px-3 py-3 text-[11.5px] text-t3">No history yet.</p>
                ) : (
                  history.map((entry, i) => (
                    <button
                      key={i}
                      onClick={() => { setShowHistory(false); setDoc(entry.claim); executeSearch(entry.claim) }}
                      className="w-full text-left px-3 py-2.5 hover:bg-raised/70 transition-colors flex flex-col gap-0.5"
                    >
                      <span className="text-[12px] font-medium text-t1 truncate">{entry.claim}</span>
                      <span className="text-[10.5px] text-t3 line-clamp-2">{entry.response?.slice(0, 90)}…</span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <IconButton label="How Firmo works" onClick={() => setShowWalkthrough(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
        </IconButton>

        <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={toggleTheme}>
          {theme === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414m12.728 0l-1.414-1.414M7.05 7.05L5.636 5.636M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </IconButton>

        {/* Desktop: collapse the context panel. Mobile: open it as a sheet. */}
        <IconButton
          label={sidebarOpen ? 'Hide context panel' : 'Show context panel'}
          onClick={toggleSidebar}
          className="hidden lg:inline-flex"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            <path strokeLinecap="round" d="M15 4v16" />
          </svg>
        </IconButton>
        <IconButton label="Show context panel" onClick={() => setMobileSidebar(true)} className="lg:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </IconButton>
      </div>
    </header>
  )
}
