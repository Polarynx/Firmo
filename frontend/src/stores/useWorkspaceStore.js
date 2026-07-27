import { create } from 'zustand'
import { postJSON } from '../lib/api'
import { loadStore, saveStore, newProject, paperId } from '../lib/projects'

// The document and the project it belongs to. Everything the student is
// building — the prose, the saved sources, the bibliography that assembles
// itself underneath — lives here.

const initial = loadStore()

let bibTimer = null

export const useWorkspaceStore = create((set, get) => ({
  // ── the document ──
  doc: '',
  activeMode: 'idle', // 'idle' | 'searching' | 'draft_checking' | 'citation_auditing'

  // ── projects ──
  projects: initial.projects,
  activeProjectId: initial.activeId,

  // ── bibliography ──
  citationStyle: localStorage.getItem('firmo_style') || 'apa',
  bibEntries: [],
  bibLoading: false,

  setDoc: doc => set({ doc }),
  setMode: activeMode => set({ activeMode }),

  /** Replace a character span in the document, e.g. inserting a citation. */
  spliceDoc: (start, end, replacement) => {
    const { doc } = get()
    set({ doc: doc.slice(0, start) + replacement + doc.slice(end) })
  },

  appendToDoc: text => {
    const doc = get().doc
    const sep = doc.trim() ? '\n\n' : ''
    set({ doc: doc + sep + text })
  },

  // ── project management ──
  activeProject: () => get().projects.find(p => p.id === get().activeProjectId) || null,

  savedSources: () => get().activeProject()?.sources || [],

  savedIds: () => new Set((get().activeProject()?.sources || []).map(paperId)),

  persist: () => {
    const { projects, activeProjectId } = get()
    saveStore({ projects, activeId: activeProjectId })
  },

  /** Save or unsave a source. Creates a starter project on the first save. */
  toggleSource: (paper, savedQuery = '') => {
    let { projects, activeProjectId } = get()
    if (projects.length === 0) {
      const p = newProject('My paper')
      projects = [p]
      activeProjectId = p.id
    }
    if (!activeProjectId || !projects.some(p => p.id === activeProjectId)) {
      activeProjectId = projects[0].id
    }
    const id = paperId(paper)
    projects = projects.map(p => {
      if (p.id !== activeProjectId) return p
      const exists = p.sources.some(s => paperId(s) === id)
      const sources = exists
        ? p.sources.filter(s => paperId(s) !== id)
        : [{ ...paper, savedAt: Date.now(), savedQuery }, ...p.sources]
      return { ...p, sources }
    })
    set({ projects, activeProjectId })
    get().persist()
    get().refreshBibliography()
  },

  createProject: name => {
    const p = newProject(name)
    set(s => ({ projects: [p, ...s.projects], activeProjectId: p.id }))
    get().persist()
    get().refreshBibliography()
  },

  deleteProject: id => {
    set(s => {
      const projects = s.projects.filter(p => p.id !== id)
      return { projects, activeProjectId: projects[0]?.id || null }
    })
    get().persist()
    get().refreshBibliography()
  },

  selectProject: id => {
    set({ activeProjectId: id })
    get().persist()
    get().refreshBibliography()
  },

  renameProject: (id, name) => {
    set(s => ({ projects: s.projects.map(p => (p.id === id ? { ...p, name } : p)) }))
    get().persist()
  },

  // ── bibliography ──
  setCitationStyle: style => {
    localStorage.setItem('firmo_style', style)
    set({ citationStyle: style })
    get().refreshBibliography()
  },

  /** Rebuild the works-cited page. Debounced: rapid saves make one request. */
  refreshBibliography: () => {
    const sources = get().savedSources()
    clearTimeout(bibTimer)
    if (sources.length === 0) {
      set({ bibEntries: [], bibLoading: false })
      return
    }
    set({ bibLoading: true })
    bibTimer = setTimeout(async () => {
      const style = get().citationStyle
      try {
        const data = await postJSON('/api/export', { papers: sources, style, format: 'text' })
        // A style change mid-flight would land stale entries; only accept ours.
        if (get().citationStyle === style) set({ bibEntries: data.entries || [] })
      } catch {
        set({ bibEntries: [] })
      } finally {
        set({ bibLoading: false })
      }
    }, 400)
  },
}))

// Build the opening bibliography for whatever project was last active.
useWorkspaceStore.getState().refreshBibliography()
