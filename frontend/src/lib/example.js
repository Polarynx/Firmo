import { FIXTURE } from './lab'

// ── A finished paper, to look at before starting your own ────────────────────
//
// A new arrival gets an empty box and a sentence about fourteen databases. The
// demo helps, but watching a video of an interface is not the same as being
// inside one: you cannot click the thing you are curious about, and you learn
// where the buttons are rather than what the tool is for.
//
// What is actually hard to convey is the middle of the work — sixty papers
// already filed by what each does in an argument, an outline with a gap in it,
// a draft whose claims are marked against the sources that back them. None of
// that can be shown on an empty workspace, and reaching it honestly costs a
// real search and a real hour of reading.
//
// So this opens a real project, already at that stage, with real papers: Card
// and Krueger, Cengiz and Dube, the actual minimum-wage literature. Every
// control works on it because there is nothing special about it — it is an
// ordinary project that happens to arrive full.
//
// Three rules it follows, all of them about not lying to the person:
//
//   It never touches existing work. It creates a new project alongside whatever
//   is already there, and opening it twice returns to the one you already have
//   rather than breeding copies.
//
//   It is unmistakably an example. The name says so, and it says so again in
//   the workspace, because a student who mistakes this for their own work would
//   find a draft they did not write under their own name.
//
//   It writes nothing to the process record. The record exists to say what this
//   person actually did, and seeding it with research they did not do would
//   corrupt the one claim Firmo makes that nobody else does. An example project
//   has no history because no history happened.

export const EXAMPLE_NAME = 'Example · minimum wage and employment'

/** True when a project is the worked example rather than the reader's own. */
export function isExampleProject(project) {
  return !!project && project.name === EXAMPLE_NAME
}

export function openExample({ useWorkspaceStore, useResearchStore, useAnnotationStore, useUIStore }) {
  const { SOURCES, BRIEF, OUTLINE, DOC, CLAIMS, CITATIONS, FACETS } = FIXTURE
  const ws = useWorkspaceStore.getState()

  // Already opened once. Go back to it rather than making a second copy — the
  // button is on the front page, and people press it twice.
  const existing = ws.projects.find(isExampleProject)
  if (existing) {
    ws.selectProject(existing.id)
  } else {
    const id = ws.createProject(EXAMPLE_NAME)
    useWorkspaceStore.setState(s => ({
      projects: s.projects.map(p =>
        p.id === id ? { ...p, sources: SOURCES.slice(0, 6), doc: DOC } : p),
      doc: DOC,
    }))
    useWorkspaceStore.getState().persist()
  }

  useResearchStore.setState({
    query: BRIEF.corrected_input,
    searchedQuery: BRIEF.corrected_input,
    brief: BRIEF,
    inputType: 'question',
    questionShape: 'extent',
    results: SOURCES,
    provisional: false,
    roleCounts: SOURCES.reduce((a, p) => ({ ...a, [p.stance]: (a[p.stance] || 0) + 1 }), {}),
    isSearching: false,
    stage: 'done',
    gathered: 428,
    kept: SOURCES.length,
    facets: FACETS,
    activeFacet: null,
    error: null,
    arms: [
      { query: 'minimum wage employment effects', found: 96 },
      { query: 'wage floor low skilled labour', found: 71 },
      { query: 'minimum wage meta-analysis', found: 54 },
      { query: 'monopsony wage setting', found: 43 },
    ],
  })

  useAnnotationStore.setState({
    claims: CLAIMS,
    outline: OUTLINE,
    citations: CITATIONS,
    outlineThesis: 'Moderate minimum wage rises do not measurably reduce employment.',
  })

  // Sources, not the draft. The filing is the part that cannot be guessed at
  // from the outside, and it is what the empty workspace can never show.
  useUIStore.getState().setStage('sources')
}

/** Everything openExample writes outside the project, put back as it was.
 *
 * The example is a real project, so `createProject` gives a student their own
 * empty one and the sources go with it. The question, the brief, the outline,
 * the claims and the reference audit do not: those live in the research and
 * annotation stores, which are global rather than per-project, and openExample
 * seeds them directly.
 *
 * So "Start my own" used to hand somebody a fresh paper still carrying the
 * example's question, its 127-word draft, its three outline sections and its
 * three checked references - the tab counters even kept the numbers. The one
 * screen whose entire job is to say "this part is not yours" was leaving most
 * of it behind.
 *
 * Kept next to openExample deliberately. These two have to agree about what the
 * example touches, and the way that guarantee breaks is by living in different
 * files.
 */
export function clearExampleState({ useResearchStore, useAnnotationStore }) {
  useResearchStore.setState({
    query: '',
    searchedQuery: '',
    brief: null,
    inputType: 'topic',
    questionShape: 'none',
    results: [],
    provisional: false,
    roleCounts: null,
    facets: [],
    activeFacet: null,
    hiddenSources: new Set(),
    showRelated: false,
    isSearching: false,
    statusMsg: '',
    arms: [],
    stage: '',
    gathered: 0,
    kept: 0,
    error: '',
    moreLoading: false,
  })

  useAnnotationStore.setState({
    claims: null,
    typos: null,
    meta: null,
    selectedClaimId: null,
    argument: null,
    citations: null,
    outline: null,
    outlineThesis: '',
    draftError: '',
    argError: '',
    citeError: '',
    outlineError: '',
  })
}
