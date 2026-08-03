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

// Which search is the current one. A run that has been superseded must not touch
// shared state on its way out, and without a way to tell, it does: the aborted
// run's `finally` sets isSearching to false and nulls the controller belonging
// to the run that replaced it, so the live search streams into a store that has
// already declared itself finished. Two searches fired close together — which a
// double-registered key handler does on every press — left the panel stuck on
// "Reading your topic…" while the server happily answered both, and each
// abandoned stream held its proxy socket for the full thirty seconds until the
// tab hit Chrome's six-connection limit and every later request queued forever.
let runId = 0

export const useResearchStore = create((set, get) => ({
  query: '',
  searchedQuery: '',
  yearFrom: null,
  brief: null,
  inputType: 'topic',
  // What kind of question this is, which decides what the roles below are
  // called and what the panel tells the student a good answer looks like.
  questionShape: 'none',
  results: [],
  provisional: false,
  roleCounts: null,
  hiddenSources: new Set(),
  showRelated: false,
  isSearching: false,
  statusMsg: '',
  // The fan-out arms for the search in flight, each with its own hit count.
  arms: [],
  // Which stage the search is in, and how many candidates have been gathered so
  // far. Both are already on the wire; keeping them lets the sift be drawn from
  // the real numbers rather than from a timer pretending to be one.
  stage: '',
  gathered: 0,
  kept: 0,
  error: '',
  moreLoading: false,
  history: loadHistory(),

  setQuery: query => set({ query }),
  setYearFrom: yearFrom => set({ yearFrom }),
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
    runId += 1          // nothing in flight speaks for the store any more
    abort?.abort()
    abort = null
    set({ isSearching: false })
    useWorkspaceStore.getState().setMode('idle')
  },

  async executeSearch(rawQuery) {
    const activeQuery = (rawQuery ?? get().query).trim()
    if (!activeQuery) return

    abort?.abort()
    const controller = new AbortController()
    const myRun = ++runId
    abort = controller

    set({
      query: activeQuery,
      searchedQuery: activeQuery,
      isSearching: true,
      statusMsg: 'Reading your topic…',
      arms: [],
      stage: '',
      gathered: 0,
      kept: 0,
      error: '',
      brief: null,
      inputType: 'topic',
      questionShape: 'none',
      results: [],
      provisional: false,
      roleCounts: null,
      hiddenSources: new Set(),
      showRelated: false,
    })
    useWorkspaceStore.getState().setMode('searching')
    // Deliberately does NOT move the student. Firmo used to jump to Sources the
    // instant a search began, which takes the screen away from someone who is
    // still reading the brief they just asked for — and worse, teaches them that
    // pressing things here moves them somewhere without warning. The Question
    // surface offers the way forward instead, and they take it when they are
    // ready.

    let briefText = ''
    let invalid = false

    try {
      await streamNDJSON('/api/research', { query: activeQuery, year_from: get().yearFrom }, {
        signal: controller.signal,
        onEvent: ev => {
          // A superseded run may still have buffered lines in flight.
          if (myRun !== runId) return
          switch (ev.event) {
            case 'status':
              // Arms ride along on the status ticks, so the ledger's counts
              // update at the same rate as the message above them.
              set({
                statusMsg: ev.message,
                ...(ev.arms ? { arms: ev.arms } : {}),
                ...(ev.stage ? { stage: ev.stage } : {}),
                ...(typeof ev.papers === 'number' ? { gathered: ev.papers } : {}),
                ...(typeof ev.considered === 'number' ? { gathered: ev.considered } : {}),
                ...(typeof ev.kept === 'number' ? { kept: ev.kept } : {}),
              })
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
                questionShape: ev.question_shape || 'none',
                searchedQuery: corrected,
                ...(corrected !== activeQuery ? { query: corrected } : {}),
              })
              break
            }
            case 'papers':
              set({ results: ev.results || [], provisional: true })
              break
            // Free-PDF links, patched in after the results. They arrive late on
            // purpose: an Unpaywall lookup per paper used to hold the whole
            // ranked set back by several seconds for the sake of a download
            // button, so the papers now land first and the links catch up.
            case 'pdfs': {
              const byId = new Map((ev.items || []).map(i => [i.id, i.oa_pdf]))
              if (byId.size === 0) break
              set(s => ({
                results: s.results.map(p => {
                  const pdf = byId.get(paperId(p))
                  return pdf ? { ...p, oa_pdf: pdf } : p
                }),
              }))
              break
            }
            case 'ranked': {
              set({
                results: ev.results || [],
                provisional: false,
                roleCounts: ev.stance_counts || null,
                stage: 'done',
                gathered: ev.total_considered || 0,
                kept: (ev.results || []).length,
                ...(ev.question_shape ? { questionShape: ev.question_shape } : {}),
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
      if (e.name !== 'AbortError' && myRun === runId) {
        set({ error: e.message || 'Something went wrong. Is the backend running?' })
      }
    } finally {
      // Only the newest run is allowed to declare the search over.
      if (myRun === runId) {
        set({ isSearching: false })
        abort = null
        if (useWorkspaceStore.getState().activeMode === 'searching') {
          useWorkspaceStore.getState().setMode('idle')
        }
      }
    }
  },

  async findMore() {
    const { results, searchedQuery, yearFrom, questionShape } = get()
    set({ moreLoading: true })
    try {
      const data = await postJSON('/api/more-sources', {
        claim: searchedQuery,
        year_from: yearFrom,
        question_shape: questionShape,
        seen_ids: results.map(paperId).filter(Boolean),
      })
      set(s => ({ results: [...s.results, ...(data.results || [])] }))
    } catch {}
    finally { set({ moreLoading: false }) }
  },
}))

// ── Selectors ──────────────────────────────────────────────────────────────

// The database filter is the only one left. Role used to filter here too, back
// when the panel showed one role at a time; the sources view stacks them all
// now, so the rail scrolls rather than hides and there is nothing to subtract.
export function selectFiltered(s) {
  if (s.hiddenSources.size === 0) return s.results
  return s.results.filter(p => !s.hiddenSources.has(p.source))
}
