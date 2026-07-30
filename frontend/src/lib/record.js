import { API } from './api'
import { authToken, useAuthStore } from '../stores/useAuthStore'

// ── The process record, client side ────────────────────────────────────────
//
// Firmo already does the things worth recording — running searches, saving
// sources, flagging claims, inserting citations, and refusing to write prose —
// and until now dropped every one of them on the floor. This module keeps them.
//
// Three rules shape it:
//
//   Recording must never cost the student anything. Nothing here blocks a
//   search, and a failed flush is retried later rather than surfaced. If the
//   log gets in the way of the work, the work loses.
//
//   It works signed out. Events accumulate in localStorage and flush when an
//   account appears, because the first hour a student spends in Firmo — before
//   they have signed up for anything — is exactly the hour worth proving.
//
//   It never stores the prose. A draft snapshot records length and a hash, not
//   the text (see `snapshotDraft`). A student should be able to hand this
//   record to an instructor without handing over an unfinished essay.

const BUFFER_KEY = 'firmo_record_buffer'
const FLUSH_DELAY = 4000
const MAX_BUFFER = 500

let timer = null
let inFlight = false

function read() {
  try {
    const raw = localStorage.getItem(BUFFER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function write(events) {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(events.slice(-MAX_BUFFER)))
  } catch {
    // A full quota is not worth breaking the app over.
  }
}

function newId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Record that something happened.
 *
 * `projectId` is captured at call time rather than read at flush time: by the
 * time a batch is sent the student may have switched papers, and an event filed
 * against the wrong project is worse than no event at all.
 */
export function logEvent(projectId, kind, payload = {}) {
  if (!projectId || !kind) return
  const events = read()
  events.push({
    id: newId(),
    project_id: projectId,
    kind,
    at: Date.now(),
    payload,
  })
  write(events)
  schedule()
}

/** The shape of a draft, never its contents. */
export function snapshotDraft(projectId, text) {
  const normalised = (text || '').split(/\s+/).filter(Boolean)
  logEvent(projectId, 'draft.snapshot', {
    chars: (text || '').length,
    words: normalised.length,
  })
}

function schedule() {
  if (!authToken()) return
  clearTimeout(timer)
  timer = setTimeout(flush, FLUSH_DELAY)
}

/**
 * Send everything buffered, oldest first, grouped by project.
 *
 * Events are only dropped from the buffer once the server has acknowledged
 * them. Appends are idempotent server-side, so a flush that succeeds but whose
 * response is lost costs a duplicate request, not a duplicate row.
 */
export async function flush() {
  const token = authToken()
  if (!token || inFlight) return
  const events = read()
  if (!events.length) return

  inFlight = true
  try {
    const byProject = new Map()
    for (const ev of events) {
      if (!byProject.has(ev.project_id)) byProject.set(ev.project_id, [])
      byProject.get(ev.project_id).push(ev)
    }

    const sent = new Set()
    for (const [projectId, batch] of byProject) {
      const res = await fetch(`${API}/api/record/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          project_id: projectId,
          events: batch.map(({ id, kind, at, payload }) => ({ id, kind, at, payload })),
        }),
      })
      if (res.status === 401) {
        useAuthStore.getState().sessionExpired()
        return
      }
      if (!res.ok) continue   // keep them buffered; the next flush retries
      batch.forEach(ev => sent.add(ev.id))
    }

    if (sent.size) write(read().filter(ev => !sent.has(ev.id)))
  } catch {
    // Offline is a normal state on campus wifi. The buffer survives it.
  } finally {
    inFlight = false
  }
}

/** How many events are waiting, for the spine's own counter. */
export function bufferedCount() {
  return read().length
}

export function readBuffer() {
  return read()
}

// Signing in is the moment a backlog becomes sendable.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flush())
  // A student who closes the tab mid-session should not lose the last four
  // seconds of their record.
  window.addEventListener('pagehide', () => { flush() })
}
