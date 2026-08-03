import { exportSession, importSession } from './session'

// ── A copy that outlives the tab ────────────────────────────────────────────
//
// Everything Firmo knows about an unsigned paper lives in localStorage, and
// localStorage is the least durable place a browser offers. It is cleared by
// "clear browsing data", by privacy extensions, by a shared library machine's
// logout script, and by the browser itself under storage pressure. A student who
// loses a week of work to any of those has no reason to try Firmo again.
//
// The .firmo export answers this and requires somebody to have thought about it
// in advance, which is exactly what nobody does before losing something.
//
// So a snapshot is kept in IndexedDB. Not because it is dramatically safer —
// both are origin-scoped and both go when someone clears everything — but
// because they fail at different times: extensions and quota eviction hit
// localStorage far more often, and a browser under pressure drops it first.
// Two independent copies is most of the protection available to a page that
// refuses to make people sign up.
//
// Restoring is never automatic. Waking up to a paper you did not open is
// alarming even when it is your own, so a fresh boot with a snapshot behind it
// offers, and waits.

const DB = 'firmo'
const STORE = 'snapshots'
const KEY = 'latest'

// Snapshots are cheap but not free: a session with sixty results and a full
// draft is a few hundred kilobytes, and this runs while somebody is typing.
const MIN_GAP_MS = 45_000
let lastWrite = 0
let writing = false

function open() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('no indexeddb'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

/**
 * Write a snapshot, at most every 45 seconds and never for an empty paper.
 *
 * Failure is swallowed on purpose. This is a safety net running behind
 * somebody's writing, and a net that interrupts the thing it is protecting has
 * misunderstood its job. Private-browsing modes reject IndexedDB outright.
 */
export async function saveSnapshot({ force = false } = {}) {
  const now = Date.now()
  if (writing || (!force && now - lastWrite < MIN_GAP_MS)) return false
  writing = true
  try {
    const data = exportSession()
    const worthKeeping = (data.sources || []).length > 0 || (data.doc || '').trim().length > 200
    if (!worthKeeping) return false
    await tx('readwrite', store => store.put({ savedAt: now, data }, KEY))
    lastWrite = now
    return true
  } catch {
    return false
  } finally {
    writing = false
  }
}

/** The snapshot, if there is one worth offering. */
export async function readSnapshot() {
  try {
    const rec = await tx('readonly', store => store.get(KEY))
    if (!rec?.data) return null
    return {
      savedAt: rec.savedAt,
      name: rec.data.name || 'Untitled paper',
      sources: (rec.data.sources || []).length,
      words: (rec.data.doc || '').trim() ? (rec.data.doc || '').trim().split(/\s+/).length : 0,
      data: rec.data,
    }
  } catch {
    return null
  }
}

export async function clearSnapshot() {
  try { await tx('readwrite', store => store.delete(KEY)) } catch {}
}

/** Put a snapshot back, through the same path a shared .firmo file takes. */
export async function restoreSnapshot(snap) {
  const blob = new File([JSON.stringify(snap.data)], 'restore.firmo', { type: 'application/json' })
  return importSession(blob)
}
