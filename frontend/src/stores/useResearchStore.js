import { create } from 'zustand'
import { postJSON, streamNDJSON } from '../lib/api'
import { paperId } from '../lib/projects'
import { useRecordStore } from './useRecordStore'
import { useUIStore } from './useUIStore'
import { useWorkspaceStore } from './useWorkspaceStore'

// Source discovery. The stream writes straight into the store, so the brief
// appears on the canvas and the cards stack up in the sidebar frame by frame.

function saveToHistory(query, response) {
  try {
    const history = JSON.parse(localStorage.getItem('firmo_history') || '[]')
    const entry = { claim: query, response, timestamp: Date.now() }
    const deduped = history.filter(h => h.claim.toLowerCase() !== query.toLowerCase())
    localStorage.setItem('firmo_history', JSON.stringify([entry, ...deduped].slice(0, 20)))
  } catch {}
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('firmo_history') || '[]')
  } catch {
    return []
  }
}

let abort = null

export const useResearchStore = create((set, get) => ({
  query: '',
  searchedQuery: '',
  yearFrom: null,
  brief: null,
  inputType: 'topic',
  results: [],
  provisional: false,
  stanceCounts: null,
  stanceFilter: 'all',
  hiddenSources: new Set(),
  showRelated: false,
  isSearching: false,
  statusMsg: '',
  // The fan-out arms for the search in flight, each with its own hit count.
  arms: [],
  error: '',
  moreLoading: false,
  history: loadHistory(),

  setQuery: query => set({ query }),
  setYearFrom: yearFrom => set({ yearFrom }),
  setStanceFilter: stanceFilter => set({ stanceFilter }),
  setShowRelated: showRelated => set({ showRelated }),

  toggleSourceFilter: src => set(s => {
    const next = new Set(s.hiddenSources)
    next.has(src) ? next.delete(src) : next.add(src)
    return { hiddenSources: next }
  }),
  clearSourceFilters: () => set({ hiddenSources: new Set() }),

  clearHistory: () => {
    localStorage.removeItem('firmo_history')
    set({ history: [] })
  },

  cancel: () => {
    abort?.abort()
    abort = null
    set({ isSearching: false })
    useWorkspaceStore.getState().setMode('idle')
  },

  async executeSearch(rawQuery) {
    const activeQuery = (rawQuery ?? get().query).trim()
    if (!activeQuery) return

    abort?.abort()
    abort = new AbortController()

    set({
      query: activeQuery,
      searchedQuery: activeQuery,
      isSearching: true,
      statusMsg: 'Reading your topic…',
      arms: [],
      error: '',
      brief: null,
      inputType: 'topic',
      results: [],
      provisional: false,
      stanceCounts: null,
      stanceFilter: 'all',
      hiddenSources: new Set(),
      showRelated: false,
    })
    useWorkspaceStore.getState().setMode('searching')
    useUIStore.getState().setSidebarView('sources')

    let briefText = ''
    let invalid = false

    try {
      await streamNDJSON('/api/research', { query: activeQuery, year_from: get().yearFrom }, {
        signal: abort.signal,
        onEvent: ev => {
          switch (ev.event) {
            case 'status':
              // Arms ride along on the status ticks, so the ledger's counts
              // update at the same rate as the message above them.
              set(ev.arms ? { statusMsg: ev.message, arms: ev.arms } : { statusMsg: ev.message })
              break
            case 'arms':
              set({ arms: ev.arms || [] })
              break
            case 'brief': {
              const corrected = ev.corrected_input || activeQuery
              briefText = ev.brief || ''
              set({
                brief: ev,
                inputType: ev.input_type || 'topic',
                searchedQuery: corrected,
                ...(corrected !== activeQuery ? { query: corrected } : {}),
              })
              break
            }
            case 'papers':
              set({ results: ev.results || [], provisional: true })
              break
            case 'ranked': {
              set({
                results: ev.results || [],
                provisional: false,
                stanceCounts: ev.stance_counts || null,
              })
              // Recorded once the search has actually resolved, not when it was
              // fired: a cancelled or failed search is not work done, and a
              // record that logs intentions rather than outcomes proves nothing.
              // A search is often the very first thing a student does, before
              // any project exists — and the record is keyed on one, so without
              // this the opening move of every session went unrecorded.
              const projectId = useWorkspaceStore.getState().ensureProject()
              useRecordStore.getState().log(projectId, 'search.run', {
                query: activeQuery,
                kept: (ev.results || []).length,
                considered: ev.total_considered || 0,
              })
              break
            }
            case 'invalid':
              invalid = true
              set({ error: 'invalid_query' })
              break
            case 'error':
              set({ error: ev.message || 'Something went wrong.' })
              break
            default:
              break
          }
        },
      })
      if (!invalid && briefText) {
        saveToHistory(activeQuery, briefText)
        set({ history: loadHistory() })
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        set({ error: e.message || 'Something went wrong. Is the backend running?' })
      }
    } finally {
      set({ isSearching: false })
      abort = null
      if (useWorkspaceStore.getState().activeMode === 'searching') {
        useWorkspaceStore.getState().setMode('idle')
      }
    }
  },

  async findMore() {
    const { results, searchedQuery, yearFrom } = get()
    set({ moreLoading: true })
    try {
      const data = await postJSON('/api/more-sources', {
        claim: searchedQuery,
        year_from: yearFrom,
        seen_ids: results.map(paperId).filter(Boolean),
      })
      set(s => ({ results: [...s.results, ...(data.results || [])] }))
    } catch {}
    finally { set({ moreLoading: false }) }
  },
}))

// ── Selectors ──────────────────────────────────────────────────────────────

export function selectFiltered(s) {
  return s.results.filter(p => {
    if (s.stanceFilter !== 'all' && p.stance !== s.stanceFilter) return false
    if (s.hiddenSources.size > 0 && s.hiddenSources.has(p.source)) return false
    return true
  })
}
