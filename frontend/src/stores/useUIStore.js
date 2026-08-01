import { create } from 'zustand'

// Which face the sidebar is showing, what the omni-bar is doing, and the
// floating cards the student has pulled out of a conversation.

const THEME_KEY = 'firmo_theme'

function initialTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark' // the workspace is charcoal-first
}

let popoverSeq = 0

export const useUIStore = create((set, get) => ({
  // 'sources' | 'claim_inspector' | 'argument_map' | 'citation_audit' | 'outline'
  sidebarView: 'sources',
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
