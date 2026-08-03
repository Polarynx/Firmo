import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useResearchStore } from '../stores/useResearchStore'
import { useUIStore } from '../stores/useUIStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

// ── A paper, in a file ──────────────────────────────────────────────────────
//
// Everything about a Firmo session that is worth carrying somewhere else: the
// question, what came back, what was kept, the plan, the prose, the claim
// verdicts, the reference audit. One JSON file, saved as `.firmo`.
//
// It exists for three situations that all had no answer. A student on a library
// machine who wants to continue at home. A group of four writing one paper. And
// anyone who has read the warning that this lives in one browser and would like
// a copy that is not a browser.
//
// The process record is deliberately NOT in it, and that is the only interesting
// decision here. The record is a hash chain whose entire value is that it
// attests to work *this person* did; a record that can be exported and imported
// is a record that can be handed over, and one that can be handed over proves
// nothing about whoever hands it in. Sources and prose travel. Provenance does
// not.

export const SESSION_VERSION = 1
export const SESSION_EXT = '.firmo'

/** Everything worth carrying, as a plain object. */
export function exportSession() {
  const ws = useWorkspaceStore.getState()
  const rs = useResearchStore.getState()
  const an = useAnnotationStore.getState()
  const project = ws.activeProject()

  return {
    firmo: SESSION_VERSION,
    exportedAt: new Date().toISOString(),
    name: project?.name || 'Untitled paper',
    citationStyle: ws.citationStyle,
    question: {
      query: rs.searchedQuery || rs.query || '',
      brief: rs.brief || null,
      questionShape: rs.questionShape || 'none',
      inputType: rs.inputType || 'topic',
    },
    // Both, and they are not the same thing: `results` is what the search
    // returned, `sources` is what the student decided to keep. A file with only
    // the keepers loses the ability to go back and pick differently.
    results: rs.results || [],
    roleCounts: rs.roleCounts || null,
    sources: project?.sources || [],
    doc: ws.doc || '',
    outline: an.outline || null,
    outlineThesis: an.outlineThesis || '',
    claims: an.claims || null,
    citations: an.citations || null,
  }
}

/** Human-readable, because someone will open it in a text editor. */
export function sessionFilename(name) {
  const slug = (name || 'firmo-session')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
  return `${slug || 'firmo-session'}${SESSION_EXT}`
}

export function downloadSession() {
  const data = exportSession()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sessionFilename(data.name)
  a.click()
  URL.revokeObjectURL(url)
  return data
}

/**
 * Read a session file into the workspace.
 *
 * Creates a new project rather than overwriting the current one. Importing is
 * something you do while already holding a paper of your own, and silently
 * replacing it would be the single most destructive thing in the product.
 *
 * Throws with a sentence a student can act on. A file picker will happily hand
 * over a holiday photo, and "Unexpected token < in JSON" is not an error
 * message, it is a stack trace wearing one.
 */
export async function importSession(file) {
  if (!file) throw new Error('No file chosen.')
  if (file.size > 25 * 1024 * 1024) throw new Error('That file is larger than 25 MB.')

  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('That file is not a Firmo session. Look for one ending in .firmo')
  }
  if (!data || typeof data !== 'object' || !data.firmo) {
    throw new Error('That file is not a Firmo session. Look for one ending in .firmo')
  }
  if (data.firmo > SESSION_VERSION) {
    throw new Error('That session was saved by a newer version of Firmo. Update and try again.')
  }

  const ws = useWorkspaceStore.getState()
  const id = ws.createProject(data.name || 'Imported paper')

  useWorkspaceStore.setState(s => ({
    projects: s.projects.map(p => (
      p.id === (id || s.activeProjectId)
        ? { ...p, sources: data.sources || [], doc: data.doc || '' }
        : p
    )),
    doc: data.doc || '',
    ...(data.citationStyle ? { citationStyle: data.citationStyle } : {}),
  }))

  const q = data.question || {}
  useResearchStore.setState({
    query: q.query || '',
    searchedQuery: q.query || '',
    brief: q.brief || null,
    questionShape: q.questionShape || 'none',
    inputType: q.inputType || 'topic',
    results: data.results || [],
    roleCounts: data.roleCounts || null,
    provisional: false,
    isSearching: false,
    error: '',
    statusMsg: '',
  })

  useAnnotationStore.setState({
    outline: data.outline || null,
    outlineThesis: data.outlineThesis || '',
    claims: data.claims || null,
    citations: data.citations || null,
    selectedClaimId: null,
    typos: null,
    meta: null,
  })

  useWorkspaceStore.getState().refreshBibliography?.()

  // Land on the question, which is where the imported paper begins and the one
  // screen that makes it obvious the import worked.
  useUIStore.getState().setStage('question')

  return {
    name: data.name || 'Imported paper',
    sources: (data.sources || []).length,
    words: (data.doc || '').trim() ? (data.doc || '').trim().split(/\s+/).length : 0,
  }
}
