import { create } from 'zustand'
import { postJSON, streamNDJSON } from '../lib/api'
import { useUIStore } from './useUIStore'
import { useWorkspaceStore } from './useWorkspaceStore'

// Everything Firmo has to say about the document in the canvas: the claims it
// highlighted, the structural read on the argument, the verdicts on a pasted
// reference list, and the outline built from saved sources.

let draftAbort = null
let citeAbort = null

export const useAnnotationStore = create((set, get) => ({
  // ── claims ──
  claims: null, // null until a check has run
  typos: null,
  meta: null,
  draftLoading: false,
  draftStatus: '',
  draftError: '',
  selectedClaimId: null,

  // ── argument ──
  argument: null,
  argLoading: false,
  argError: '',

  // ── citation audit ──
  citations: null,
  citeLoading: false,
  citeStatus: '',
  citeError: '',

  // ── outline ──
  outline: null,
  outlineLoading: false,
  outlineError: '',
  outlineThesis: '',

  selectClaim: id => {
    set({ selectedClaimId: id })
    if (id) useUIStore.getState().setSidebarView('claim_inspector')
  },

  updateClaim: (id, patch) => set(s => ({
    claims: (s.claims || []).map(c => (c.id === id ? { ...c, ...patch } : c)),
  })),

  clearDraft: () => set({
    claims: null, typos: null, meta: null, draftError: '',
    selectedClaimId: null, argument: null, argError: '',
  }),

  dismissTypos: () => set({ typos: null }),

  cancelDraft: () => {
    draftAbort?.abort()
    draftAbort = null
    set({ draftLoading: false })
    useWorkspaceStore.getState().setMode('idle')
  },

  async checkDraft(text, savedPapers = []) {
    if (!text.trim()) return
    draftAbort?.abort()
    draftAbort = new AbortController()

    set({
      draftLoading: true, draftError: '', claims: null, typos: null, meta: null,
      selectedClaimId: null, argument: null, argError: '',
      draftStatus: 'Reading your draft…',
    })
    useWorkspaceStore.getState().setMode('draft_checking')
    useUIStore.getState().setSidebarView('argument_map')

    try {
      await streamNDJSON('/api/draft-check', { text, saved_papers: savedPapers }, {
        signal: draftAbort.signal,
        onEvent: ev => {
          switch (ev.event) {
            case 'status':
              set({ draftStatus: ev.message })
              break
            case 'claims':
              set({
                claims: ev.items || [],
                meta: { truncated: ev.truncated, checkedChars: ev.checked_chars, totalFound: ev.total_found },
              })
              break
            case 'typos':
              set({ typos: ev.items || [] })
              break
            case 'verdict': {
              const { event: _e, ...patch } = ev
              get().updateClaim(patch.id, patch)
              break
            }
            case 'error':
              set({ draftError: ev.message || 'Something went wrong.' })
              break
            default:
              break
          }
        },
      })
    } catch (e) {
      if (e.name !== 'AbortError') {
        set({ draftError: e.message || 'Something went wrong. Is the backend running?' })
      }
    } finally {
      set({ draftLoading: false })
      draftAbort = null
      useWorkspaceStore.getState().setMode('idle')
      // The structural read is what a student wants next, so fetch it now
      // rather than making them ask for it.
      get().reviewArgument(text)
    }
  },

  async reviewArgument(text) {
    if (!text.trim() || get().argLoading) return
    set({ argLoading: true, argError: '' })
    try {
      const data = await postJSON('/api/argument-review', { text })
      set({ argument: data })
    } catch {
      set({ argError: "Couldn't review the argument just now." })
    } finally {
      set({ argLoading: false })
    }
  },

  cancelCitations: () => {
    citeAbort?.abort()
    citeAbort = null
    set({ citeLoading: false })
    useWorkspaceStore.getState().setMode('idle')
  },

  clearCitations: () => set({ citations: null, citeError: '' }),

  async checkCitations(text) {
    if (!text.trim()) return
    citeAbort?.abort()
    citeAbort = new AbortController()

    set({
      citeLoading: true, citeError: '', citations: null,
      citeStatus: 'Reading your reference list…',
    })
    useWorkspaceStore.getState().setMode('citation_auditing')
    useUIStore.getState().setSidebarView('citation_audit')

    try {
      await streamNDJSON('/api/check-citations', { text }, {
        signal: citeAbort.signal,
        onEvent: ev => {
          switch (ev.event) {
            case 'status':
              set({ citeStatus: ev.message })
              break
            case 'entries':
              set({ citations: (ev.items || []).map(it => ({ ...it, verdict: 'checking' })) })
              break
            case 'result': {
              const { event: _e, index, ...patch } = ev
              set(s => ({
                citations: (s.citations || []).map((c, i) => (i === index ? { ...c, ...patch } : c)),
              }))
              break
            }
            case 'error':
              set({ citeError: ev.message || 'Something went wrong.' })
              break
            default:
              break
          }
        },
      })
    } catch (e) {
      if (e.name !== 'AbortError') {
        set({ citeError: e.message || 'Something went wrong. Is the backend running?' })
      }
    } finally {
      set({ citeLoading: false })
      citeAbort = null
      useWorkspaceStore.getState().setMode('idle')
    }
  },

  async buildOutline(papers, thesis = '') {
    if (!papers?.length) return
    set({ outlineLoading: true, outlineError: '', outlineThesis: thesis })
    useUIStore.getState().setSidebarView('outline')
    try {
      const data = await postJSON('/api/outline', { papers, thesis })
      set({ outline: data.sections || [] })
    } catch {
      set({ outlineError: "Couldn't build an outline from these sources just now." })
    } finally {
      set({ outlineLoading: false })
    }
  },
}))
