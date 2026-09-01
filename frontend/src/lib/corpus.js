import { API, safeFetch } from './api'
import { authToken } from '../stores/useAuthStore'

// Reading a project's papers, in the background.
//
// The corpus is what lets a claim be matched to page 8 of a paper instead of to
// its abstract, and it only exists if the PDFs get read. Asking the student to
// press "ingest" would mean most projects never have one, so this runs itself
// after a source is saved.
//
// It is deliberately quiet: no progress bar, no blocking, no error surfaced.
// Ingest failing means the evidence drawer stays hidden for that paper, which
// is exactly what a student sees today anyway. It is never worth interrupting
// someone's writing to tell them a publisher refused a PDF request.

const DELAY = 6000

let timer = null
let running = false

/**
 * Read any newly saved open-access PDFs into the project corpus.
 *
 * Debounced, because saving five sources in a row should read them in one pass.
 * The server skips papers it has already ingested, so re-sending the whole
 * saved list is correct and costs one request.
 */
export function scheduleIngest(projectId, papers) {
  if (!authToken() || !projectId) return

  // Everything saved, not only what already carries an `oa_pdf`.
  //
  // This filter was the reason the corpus so often stayed empty. `oa_pdf` is
  // attached by the Unpaywall pass during a search, and only to the top 25
  // results — so a paper the student scrolled to and saved, or imported from
  // Zotero, arrived without one and was dropped here, before the server ever
  // saw it. The server can now derive a PDF location for arXiv and PubMed
  // Central records on its own, and it is the only place that knows what it can
  // reach, so the decision belongs there. It skips what it cannot read, and it
  // already skips what it has read before.
  const list = (papers || []).filter(Boolean)
  if (!list.length) return

  clearTimeout(timer)
  timer = setTimeout(() => ingest(projectId, list), DELAY)
}

export async function ingest(projectId, papers) {
  if (running || !authToken()) return
  running = true
  try {
    const res = await safeFetch(`${API}/api/corpus/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ project_id: projectId, papers }),
    })
    // The response is a progress stream. Nothing here consumes it beyond
    // draining it, but it must be drained: an abandoned stream leaves the
    // server writing into a socket nobody is reading.
    if (res.ok && res.body) {
      const reader = res.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    }
  } catch {
    // Offline, or a publisher refused. Either way the student loses nothing
    // they can see, and the next save retries the whole list.
  } finally {
    running = false
  }
}

export function cancelIngest() {
  clearTimeout(timer)
}
