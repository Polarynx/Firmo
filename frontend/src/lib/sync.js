import { API } from './api'
import { authToken, useAuthStore } from '../stores/useAuthStore'

// Keeping one student's papers the same on every machine they use.
//
// The unit of sync is a whole project, and the newer edit wins. That means two
// devices editing the *same* paper in the same minute will lose the older set
// of changes — but editing different papers on different machines, which is
// what students actually do, merges cleanly. Per-field merging would buy very
// little here and cost a lot of machinery.

const PUSH_DELAY = 1500

let timer = null
let inFlight = null
let pendingWhileInFlight = false

/** Shape a local project for the wire. */
function toWire(project) {
  return {
    id: project.id,
    name: project.name || 'Untitled paper',
    data: {
      sources: project.sources || [],
      // The draft has never been persisted anywhere until now, so reloading
      // the page threw it away. It belongs to the project, not the browser.
      doc: project.doc || '',
    },
    updated_at: project.updatedAt || project.createdAt || Date.now(),
    deleted: !!project.deleted,
  }
}

/** Shape a project from the wire back into the local store's form. */
function fromWire(row) {
  return {
    id: row.id,
    name: row.name || 'Untitled paper',
    sources: row.data?.sources || [],
    doc: row.data?.doc || '',
    createdAt: row.data?.createdAt || row.updated_at || Date.now(),
    updatedAt: row.updated_at || 0,
    deleted: !!row.deleted,
  }
}

/**
 * Push local projects, get the merged set back.
 * Returns null when signed out or the request fails — callers keep what they
 * have rather than treating a dropped connection as "the server says empty".
 */
export async function syncNow(localProjects) {
  const token = authToken()
  if (!token) return null

  try {
    const res = await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projects: (localProjects || []).map(toWire) }),
    })
    if (res.status === 401) {
      useAuthStore.getState().sessionExpired()
      return null
    }
    if (!res.ok) return null
    const data = await res.json()
    return (data.projects || []).map(fromWire)
  } catch {
    // Offline is a normal state for a student on campus wifi, not an error
    // worth interrupting them about. The next push carries the same changes.
    return null
  }
}

/**
 * Sync soon, collapsing a burst of edits into one request. Saving six sources
 * in a row should cost one round trip, not six.
 */
export function scheduleSync(getProjects, onMerged) {
  if (!authToken()) return
  clearTimeout(timer)
  timer = setTimeout(() => run(getProjects, onMerged), PUSH_DELAY)
}

async function run(getProjects, onMerged) {
  // One request at a time: two overlapping merges could interleave and let an
  // older snapshot land last.
  if (inFlight) {
    pendingWhileInFlight = true
    return
  }
  inFlight = syncNow(getProjects())
  try {
    const merged = await inFlight
    if (merged) onMerged(merged)
  } finally {
    inFlight = null
    if (pendingWhileInFlight) {
      pendingWhileInFlight = false
      run(getProjects, onMerged)
    }
  }
}

export function cancelScheduledSync() {
  clearTimeout(timer)
}
