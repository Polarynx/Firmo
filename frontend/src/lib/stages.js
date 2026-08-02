import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useResearchStore } from '../stores/useResearchStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

// ── The stages of a paper ───────────────────────────────────────────────────
//
// Firmo had three ways to move around — a record rail, a five-face switcher in
// the sidebar, and a set of slash commands — and not one of them said where the
// student was or what was left. Three navigations and no map is worse than one
// navigation, because every extra route is another thing to learn before
// anything gets written.
//
// So there is one now, and it is the paper itself. These seven stages are the
// order a paper actually gets made in, each reporting real state from the
// stores rather than a step counter someone has to remember to advance.
//
// Three rules hold it together.
//
// Nothing is locked. A student who has drafted three paragraphs and realises
// they need another source has to be able to go straight back to Sources and
// return, and a workflow that gates the next step on the last one makes that a
// fight. The stages are a map, not a wizard.
//
// A stage that cannot run yet says what it needs. `blocked` carries the reason
// in the student's words, which is the difference between a command that does
// nothing when pressed and one that explains itself.
//
// Every stage owns the centre of the screen. This is the rule the workspace was
// missing: the rail used to change only the panel on the right, so the middle
// stayed one long column with the hero, the brief, the editor, the claim counts
// and the bibliography all stacked on it at once, and pressing "Sources" moved
// something in the corner of your eye. `surface` names what the middle becomes.
// Draft, Claims and Export are three readings of the same page rather than
// three places, so they share one surface and differ by mode.

export const STAGES = [
  {
    key: 'question',
    label: 'Question',
    surface: 'question',
    hint: 'What you are asking, and what kind of answer it wants',
  },
  {
    key: 'sources',
    label: 'Sources',
    surface: 'sources',
    hint: 'What Firmo found, filed by what each one does',
  },
  {
    key: 'outline',
    label: 'Outline',
    surface: 'outline',
    hint: 'The shape of the argument, built from what you saved',
  },
  {
    key: 'draft',
    label: 'Draft',
    surface: 'document',
    hint: 'The page itself',
  },
  {
    key: 'claims',
    label: 'Claims',
    surface: 'document',
    hint: 'Every sentence that needs backing, and whether it has any',
  },
  {
    key: 'references',
    label: 'References',
    surface: 'references',
    hint: 'Every entry checked against the publisher record',
  },
  {
    key: 'export',
    label: 'Export',
    surface: 'document',
    hint: 'The document and its works-cited page, out of Firmo',
  },
]

/** The stage record for a key, or the first stage. */
export function stageMeta(key) {
  return STAGES.find(s => s.key === key) || STAGES[0]
}

/**
 * Where the paper stands, computed from the stores rather than tracked.
 *
 * Each stage reports one of three states — `empty`, `part`, `done` — plus a
 * count worth showing at 34px and, when it cannot run, the reason. Derived on
 * every render because it is a handful of length checks over data already in
 * memory; a cached version would be one more thing to invalidate.
 */
export function readStages() {
  const ws = useWorkspaceStore.getState()
  const rs = useResearchStore.getState()
  const an = useAnnotationStore.getState()

  const sources = ws.activeProject()?.sources || []
  const doc = (ws.doc || '').trim()
  const words = doc ? doc.split(/\s+/).length : 0
  const claims = an.claims || []
  const outline = an.outline || []
  const cites = an.citations || []

  // A claim is settled once the student has acted on it; "needs a citation" and
  // "evidence disagrees" are the two that are still asking for something.
  const openClaims = claims.filter(
    c => c.status === 'needs_citation' || c.status === 'shaky',
  ).length
  const badRefs = cites.filter(
    c => c.verdict === 'not_found' || c.verdict === 'retracted',
  ).length
  const outlineGaps = outline.reduce(
    (n, s) => n + (s.points || []).filter(p => !(p.sources || []).length).length,
    0,
  )

  const state = (done, part) => (done ? 'done' : part ? 'part' : 'empty')

  return {
    question: {
      state: rs.brief ? 'done' : 'empty',
      note: rs.brief ? (rs.searchedQuery || '').slice(0, 60) : null,
    },
    sources: {
      state: state(sources.length >= 4, sources.length > 0 || rs.results.length > 0),
      count: sources.length || null,
      note: sources.length ? `${sources.length} saved` : rs.results.length ? `${rs.results.length} found, none saved` : null,
      blocked: sources.length === 0 && rs.results.length === 0
        ? 'Search for a topic first — the rest of the paper is built out of what you save.'
        : null,
    },
    outline: {
      state: state(outline.length > 0 && outlineGaps === 0, outline.length > 0),
      count: outline.length || null,
      note: outline.length
        ? `${outline.length} section${outline.length !== 1 ? 's' : ''}${outlineGaps ? `, ${outlineGaps} unsourced` : ''}`
        : null,
      blocked: sources.length < 4
        ? `Save ${4 - sources.length} more source${4 - sources.length !== 1 ? 's' : ''} — an outline built from two papers is a guess.`
        : null,
    },
    draft: {
      state: state(words >= 300, words > 0),
      count: words || null,
      note: words ? `${words.toLocaleString()} word${words !== 1 ? 's' : ''}` : null,
    },
    claims: {
      state: state(claims.length > 0 && openClaims === 0, claims.length > 0),
      count: claims.length || null,
      note: claims.length
        ? openClaims ? `${openClaims} still unbacked` : `${claims.length} all backed`
        : null,
      blocked: words < 40 ? 'Write a paragraph or two first, then Firmo can mark what needs backing.' : null,
    },
    references: {
      state: state(cites.length > 0 && badRefs === 0, cites.length > 0),
      count: cites.length || null,
      note: cites.length
        ? badRefs ? `${badRefs} could not be found` : `${cites.length} all verified`
        : null,
      blocked: sources.length === 0 && !doc
        ? 'Paste a reference list into the document, or save sources and Firmo builds one.'
        : null,
    },
    export: {
      state: sources.length > 0 && words > 0 ? 'done' : 'empty',
      note: null,
      blocked: !doc ? 'Nothing to export yet.' : null,
    },
  }
}

/**
 * The one thing most worth doing next, or null when the student is not obviously
 * stuck. Deliberately conservative: an assistant that always has a suggestion is
 * one the student stops reading, so this returns nothing once a paper is moving
 * under its own steam.
 */
export function nextMove(stages) {
  if (stages.question.state === 'empty') return null   // the empty canvas already says this

  if (stages.sources.state === 'empty') {
    return { stage: 'sources', label: 'Find sources', text: 'Firmo has read your question. Nothing is saved to the paper yet.' }
  }
  if (stages.sources.state === 'part' && !stages.sources.count) {
    return { stage: 'sources', label: 'Open sources', text: 'Results are in — bookmark the ones you will actually use.' }
  }
  if (stages.outline.state === 'empty' && !stages.outline.blocked) {
    return { stage: 'outline', label: 'Build the outline', text: `${stages.sources.count} sources saved. Firmo can plan the argument from them.` }
  }
  if (stages.draft.state === 'empty' && stages.outline.state !== 'empty') {
    return { stage: 'draft', label: 'Start writing', text: 'The outline is ready. Send a section to the page and start from it.' }
  }
  if (stages.draft.state !== 'empty' && stages.claims.state === 'empty' && !stages.claims.blocked) {
    return { stage: 'claims', label: 'Check the draft', text: 'Firmo can mark every sentence a reader would expect a source for.' }
  }
  if (stages.claims.count && stages.claims.state === 'part') {
    return { stage: 'claims', label: 'Open claims', text: `${stages.claims.note} — each one needs a source or a rewrite.` }
  }
  if (stages.claims.state === 'done' && stages.references.state === 'empty') {
    return { stage: 'references', label: 'Verify references', text: 'Every claim is backed. Last thing before hand-in is the reference list.' }
  }
  return null
}
