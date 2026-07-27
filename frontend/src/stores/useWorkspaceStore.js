import { create } from 'zustand'
import { postJSON } from '../lib/api'
import { loadStore, saveStore, newProject, paperId } from '../lib/projects'
import { scheduleSync, syncNow } from '../lib/sync'

// The document and the project it belongs to. Everything the student is
// building — the prose, the saved sources, the bibliography that assembles
// itself underneath — lives here.

const initial = loadStore()

let bibTimer = null
let docTimer = null

export const useWorkspaceStore = create((set, get) => ({
  // ── the document ──
  // Opens on whatever was last being written, rather than a blank page that
  // makes it look like the work is gone.
  doc: initial.projects.find(p => p.id === initial.activeId)?.doc || '',
  activeMode: 'idle', // 'idle' | 'searching' | 'draft_checking' | 'citation_auditing'

  // ── projects ──
  projects: initial.projects,
  activeProjectId: initial.activeId,

  // ── bibliography ──
  citationStyle: localStorage.getItem('firmo_style') || 'apa',
  bibEntries: [],
  bibLoading: false,

  setDoc: doc => {
    set({ doc })
    // Save the writing itself, not just the sources around it. Debounced hard,
    // because this fires on every keystroke.
    clearTimeout(docTimer)
    docTimer = setTimeout(() => get().persist(), 900)
  },
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

  /**
   * Write to disk and, if signed in, to the server.
   *
   * The active project absorbs the current draft first: `doc` used to live
   * only in memory, so reloading the page or switching papers threw the
   * writing away. Touching `updatedAt` here is what lets the server decide
   * which device's copy is newer.
   */
  persist: ({ touch = true } = {}) => {
    const { projects, activeProjectId } = get()
    const next = projects.map(p =>
      p.id === activeProjectId
        ? { ...p, doc: get().doc, ...(touch ? { updatedAt: Date.now() } : {}) }
        : p
    )
    set({ projects: next })
    saveStore({ projects: next, activeId: activeProjectId })
    scheduleSync(() => get().projects, merged => get().applyMerged(merged))
  },

  /**
   * Adopt the server's merged view. Projects deleted on another device arrive
   * as tombstones and are dropped here, so a delete does not come back.
   */
  applyMerged: merged => {
    const live = merged.filter(p => !p.deleted)
    const { activeProjectId } = get()
    const stillThere = live.some(p => p.id === activeProjectId)
    const activeId = stillThere ? activeProjectId : (live[0]?.id || null)

    set({ projects: live, activeProjectId: activeId })
    saveStore({ projects: live, activeId })

    // If the active paper's draft changed on another device, show that copy —
    // but never overwrite unsaved words the student is looking at right now.
    const active = live.find(p => p.id === activeId)
    if (active && !get().doc.trim() && active.doc) set({ doc: active.doc })

    get().refreshBibliography()
  },

  /** Pull everything down after signing in, then re-render from the merge. */
  pullFromServer: async () => {
    const merged = await syncNow(get().projects)
    if (merged) get().applyMerged(merged)
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

  /**
   * Add many sources at once, from an import. Anything already in the project
   * is skipped rather than duplicated, and the count of each is returned so
   * the student is told what actually happened to their file.
   */
  addSources: (papers, savedQuery = 'Imported') => {
    let { projects, activeProjectId } = get()
    if (projects.length === 0) {
      const p = newProject('My paper')
      projects = [p]
      activeProjectId = p.id
    }
    if (!activeProjectId || !projects.some(p => p.id === activeProjectId)) {
      activeProjectId = projects[0].id
    }
    const existing = new Set(
      (projects.find(p => p.id === activeProjectId)?.sources || []).map(paperId)
    )
    const fresh = []
    for (const paper of papers) {
      const id = paperId(paper)
      if (existing.has(id)) continue
      existing.add(id)
      fresh.push({ ...paper, savedAt: Date.now(), savedQuery })
    }
    if (fresh.length > 0) {
      projects = projects.map(p =>
        p.id === activeProjectId ? { ...p, sources: [...fresh, ...p.sources] } : p
      )
      set({ projects, activeProjectId })
      get().persist()
      get().refreshBibliography()
    }
    return { added: fresh.length, skipped: papers.length - fresh.length }
  },

  createProject: name => {
    const p = newProject(name)
    set(s => ({ projects: [p, ...s.projects], activeProjectId: p.id }))
    get().persist()
    get().refreshBibliography()
  },

  deleteProject: id => {
    const removed = get().projects.find(p => p.id === id)
    const projects = get().projects.filter(p => p.id !== id)
    const activeId = projects[0]?.id || null
    set({ projects, activeProjectId: activeId, doc: projects.find(p => p.id === activeId)?.doc || '' })
    saveStore({ projects, activeId })

    // The server has to be told this was deleted, not merely absent: a plain
    // push of "everything I have" would look like this device never knew about
    // the project, and the next sync from another device would resurrect it.
    if (removed) {
      const tombstone = { ...removed, deleted: true, updatedAt: Date.now() }
      syncNow([...projects, tombstone]).then(merged => {
        if (merged) get().applyMerged(merged)
      })
    }
    get().refreshBibliography()
  },

  selectProject: id => {
    // Park the current draft with the project it belongs to before swapping,
    // or switching papers to check a source would lose what was on screen.
    get().persist()
    const next = get().projects.find(p => p.id === id)
    set({ activeProjectId: id, doc: next?.doc || '' })
    saveStore({ projects: get().projects, activeId: id })
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
