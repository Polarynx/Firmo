import { create } from 'zustand'

import { useWorkspaceStore } from './useWorkspaceStore'

// Safe in this direction only: the workspace store knows nothing about the UI.
const activeProjectId = () => useWorkspaceStore.getState().activeProjectId || '_'

// Where the student is in the paper, what the inspector is showing, what the
// omni-bar is doing, and the floating cards pulled out of a conversation.
//
// `stage` and `sidebarView` used to be the same string, which is why clicking a
// claim felt like being teleported: opening a detail and moving to another part
// of the paper were literally the same action. They are two different questions
// — where am I, and what am I looking at closely — so they are two pieces of
// state. `stage` owns the centre of the screen; `sidebarView` owns the panel on
// the right and never moves the student anywhere.

const THEME_KEY = 'firmo_theme'

// The panel that belongs beside each stage when the student arrives with
// nothing selected. Not a lock: anything may set `sidebarView` afterwards.
const COMPANION = {
  // The brief belongs to the Question surface itself. Printing it a second time
  // in the panel beside it was the same paragraph twice on one screen.
  question:   'saved',
  sources:    'saved',
  outline:    'saved',
  draft:      'saved',
  claims:     'argument_map',
  references: 'saved',
  export:     'saved',
}

function initialTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark' // the workspace is charcoal-first
}

let popoverSeq = 0

export const useUIStore = create((set, get) => ({
  // Which part of the paper the centre is showing. See lib/stages.js.
  stage: 'question',
  stageByProject: {},

  // 'saved' | 'claim_inspector' | 'argument_map'
  sidebarView: 'saved',
  sidebarOpen: true,
  mobileSidebarOpen: false,

  omniValue: '',
  omniBusy: false,
  omniOpen: false, // expanded transcript above the bar

  popovers: [],

  theme: initialTheme(),
  showWalkthrough: false,
  showHistory: false,
  showProjects: false,
  showImport: false,
  showAuth: false,
  showRecord: false,

  /** Move to a part of the paper. Brings its companion panel with it. */
  setStage: stage => set(s => ({
    stage,
    sidebarView: COMPANION[stage] || 'saved',
    // Remembered per paper. Switching to another project to look something up
    // and coming back used to land you wherever the other paper had left the
    // rail, which is the kind of small dislocation that makes people stop
    // switching.
    stageByProject: { ...s.stageByProject, [activeProjectId()]: stage },
  })),

  /** Land on whichever part of *this* paper was last open. */
  recallStage: projectId => {
    const stage = get().stageByProject[projectId] || 'question'
    set({ stage, sidebarView: COMPANION[stage] || 'saved' })
  },

  setSidebarView: sidebarView => set({ sidebarView }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
  setMobileSidebar: mobileSidebarOpen => set({ mobileSidebarOpen }),

  setOmniValue: omniValue => set({ omniValue }),
  setOmniBusy: omniBusy => set({ omniBusy }),
  setOmniOpen: omniOpen => set({ omniOpen }),

  /** Float a card out of the omni-bar. Returns its id so the stream can fill it. */
  pushPopover: card => {
    const id = `pop-${++popoverSeq}`
    set(s => ({
      popovers: [...s.popovers, { id, title: 'Firmo', body: '', streaming: false, ...card }],
    }))
    return id
  },

  updatePopover: (id, patch) => set(s => ({
    popovers: s.popovers.map(p => (p.id === id ? { ...p, ...patch } : p)),
  })),

  closePopover: id => set(s => ({ popovers: s.popovers.filter(p => p.id !== id) })),
  closeAllPopovers: () => set({ popovers: [] }),

  setTheme: theme => {
    localStorage.setItem(THEME_KEY, theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  setShowWalkthrough: showWalkthrough => set({ showWalkthrough }),
  setShowHistory: showHistory => set({ showHistory }),
  setShowProjects: showProjects => set({ showProjects }),
  setShowImport: showImport => set({ showImport }),
  setShowAuth: showAuth => set({ showAuth }),
  setShowRecord: showRecord => set({ showRecord }),
}))

// Paint the theme before first render so there is no flash of the wrong one.
document.documentElement.classList.toggle('dark', useUIStore.getState().theme === 'dark')
