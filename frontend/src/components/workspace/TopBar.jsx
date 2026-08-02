import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useUIStore } from '../../stores/useUIStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { CITATION_STYLES, SPRING } from '../../lib/constants'
import { IconButton, IconCluster, LED } from '../ui/primitives'

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
  const setStage = useUIStore(s => s.setStage)
  const showHistory = useUIStore(s => s.showHistory)
  const setShowHistory = useUIStore(s => s.setShowHistory)
  const showProjects = useUIStore(s => s.showProjects)
  const setShowProjects = useUIStore(s => s.setShowProjects)
  const toggleSidebar = useUIStore(s => s.toggleSidebar)
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const setMobileSidebar = useUIStore(s => s.setMobileSidebar)

  const setShowAuth = useUIStore(s => s.setShowAuth)
  const user = useAuthStore(s => s.user)
  const signOut = useAuthStore(s => s.signOut)

  const citationStyle = useWorkspaceStore(s => s.citationStyle)
  const setCitationStyle = useWorkspaceStore(s => s.setCitationStyle)
  const activeMode = useWorkspaceStore(s => s.activeMode)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [styleMenu, setStyleMenu] = useState(false)
  const styleRef = useRef(null)
  const [accountMenu, setAccountMenu] = useState(false)
  const accountRef = useRef(null)

  // Same self-dismissal as the style menu: the workspace-wide handler only
  // closes the store-backed menus.
  useEffect(() => {
    if (!accountMenu) return
    function onDown(e) {
      if (!accountRef.current?.contains(e.target)) setAccountMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [accountMenu])

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
    // 44px rather than 52: the stage tabs cost the centre a strip of its own,
    // and the masthead is the least load-bearing chrome on the screen.
    <header className="relative z-30 shrink-0 h-11 flex items-center justify-between gap-3
      px-3 sm:px-4 border-b border-hair/[0.07] bg-panel/70 backdrop-blur-2xl">

      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={() => { setDoc(''); clearDraft(); setStage('question') }}
          title="New document"
          className="group flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        >
          {/* The mark: a serif F set into an emerald plate. Small enough to
              read as a favicon, which is where it also lives. */}
          <span className="emblem">F</span>
          <span className="font-display font-bold text-[17px] tracking-tight text-t1 hidden sm:block">
            Firmo
          </span>
        </button>

        <span className="text-t3/40 select-none text-sm">/</span>

        {/* Project switcher.
            With no project it read "No paper yet ▾", which is a status wearing a
            control's clothing — nothing about it says you may press it to start
            one, and starting a paper was otherwise only possible as a side
            effect of running a search. It names the action now. */}
        <div className="relative min-w-0">
          <button
            onClick={() => setShowProjects(!showProjects)}
            title={active ? 'Switch or start a paper' : 'Start a paper'}
            className={`pill max-w-full ${active ? '' : '!text-brand-600 dark:!text-signal !border-brand-500/40'}`}
          >
            <span className="truncate max-w-[34vw] sm:max-w-[220px]">
              {active ? active.name : '+ Start a paper'}
            </span>
            {active && (
              <span className="font-mono text-[10px] text-t3 tabular-nums shrink-0">
                {active.sources.length}
              </span>
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
                className="absolute left-0 top-9 z-40 glass p-1.5 flex flex-col gap-0.5 w-[280px]"
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

      <div className="flex items-center gap-2 shrink-0">

        {/* Active citation style: everything Firmo formats answers to this. */}
        <div ref={styleRef} className="relative hidden sm:block">
          <button
            onClick={() => setStyleMenu(m => !m)}
            title="Citation style"
            className="pill"
          >
            <span className="font-mono text-[10px] text-brand-600 dark:text-signal">
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
                    className={`text-left text-[11.5px] px-2.5 py-1.5 rounded-lg transition-colors ${
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

        {/* System status: what Firmo is doing right now, always visible. The
            LED only pings while work is actually running, so a live indicator
            never becomes background noise. */}
        <span
          title={STATUS_COPY[activeMode] || 'Ready'}
          className="pill hidden md:inline-flex"
        >
          <LED live={activeMode !== 'idle'} />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-t3">
            {STATUS_COPY[activeMode] || 'Ready'}
          </span>
        </span>

        {/* Account. Signed out, this is the only place Firmo asks for anything,
            and it says what the account is actually for. */}
        {user ? (
          <div className="relative" ref={accountRef}>
            <button
              onClick={() => setAccountMenu(m => !m)}
              title={user.email}
              className="pill"
            >
              <span className="grid place-items-center h-4 w-4 rounded-full bg-brand-500/20
                text-brand-600 dark:text-signal font-mono text-[9px] font-semibold">
                {(user.name || user.email)[0].toUpperCase()}
              </span>
              <span className="hidden sm:inline max-w-[110px] truncate">
                {user.name || user.email.split('@')[0]}
              </span>
            </button>
            <AnimatePresence>
              {accountMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={SPRING}
                  className="absolute right-0 top-9 z-40 glass p-1.5 flex flex-col gap-0.5 w-[236px]"
                >
                  <div className="px-2.5 py-2 flex flex-col gap-0.5">
                    <span className="eyebrow">Signed in</span>
                    <span className="text-[12px] text-t1 truncate">{user.email}</span>
                    <span className="text-[10.5px] text-t3">
                      Your papers sync to every device you sign in on.
                    </span>
                  </div>
                  <span className="h-px bg-hair/10 my-0.5" aria-hidden="true" />
                  <button
                    onClick={() => { setAccountMenu(false); signOut() }}
                    className="text-left text-[12px] px-2.5 py-1.5 rounded-lg text-t2 hover:bg-raised hover:text-t1 transition-colors"
                  >
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <button onClick={() => setShowAuth(true)} className="pill">
            Sign in
          </button>
        )}

        <IconCluster>
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

        {/* A play triangle, not a question mark. "?" is where help goes to die;
            this is a sixty-second showing of the product working, and it should
            look like something you press to watch. */}
        <IconButton label="Watch the demo" onClick={() => setShowWalkthrough(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 8.5l6 3.5-6 3.5v-7z" />
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
        </IconCluster>
      </div>
    </header>
  )
}
