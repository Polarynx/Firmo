import { create } from 'zustand'

import { logEvent, snapshotDraft, flush } from '../lib/record'

// The record as the student sees it, which is not the same list as the one
// waiting to be sent.
//
// `lib/record.js` owns the outbound buffer and empties it as the server
// acknowledges batches. The spine has to keep showing the session regardless,
// so the display log is kept separately and never cleared by a successful
// flush. Two lists, one write path: `log()` feeds both, so they cannot drift.

const DISPLAY_KEY = 'firmo_record_log'
const MAX_DISPLAY = 400

function load() {
  try {
    const raw = localStorage.getItem(DISPLAY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(events) {
  try {
    localStorage.setItem(DISPLAY_KEY, JSON.stringify(events.slice(-MAX_DISPLAY)))
  } catch {}
}

export const useRecordStore = create((set, get) => ({
  events: load(),

  /** Record something the student did. The only way in. */
  log(projectId, kind, payload = {}) {
    if (!projectId || !kind) return
    logEvent(projectId, kind, payload)
    const events = [...get().events, { projectId, kind, payload, at: Date.now() }]
      .slice(-MAX_DISPLAY)
    persist(events)
    set({ events })
  },

  logDraft(projectId, text) {
    if (!projectId) return
    snapshotDraft(projectId, text)
    const events = [...get().events, {
      projectId,
      kind: 'draft.snapshot',
      payload: { chars: (text || '').length },
      at: Date.now(),
    }].slice(-MAX_DISPLAY)
    persist(events)
    set({ events })
  },

  forProject(projectId) {
    return get().events.filter(e => e.projectId === projectId)
  },

  flushNow: flush,
}))
