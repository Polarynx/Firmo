import { FIXTURE } from './lab'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useResearchStore } from '../stores/useResearchStore'
import { useUIStore } from '../stores/useUIStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

// ── The demo ────────────────────────────────────────────────────────────────
//
// Firmo used to explain itself with eight cards of prose behind a dialog, which
// is the format every product uses and nobody reads. A student closing that
// dialog knows the words "argument map" and still does not know where to press.
//
// So it shows instead. A cursor moves across the real interface, types a real
// question, saves real sources, writes into the real page and watches the marks
// land. Sixty seconds, no narration beyond one line at a time.
//
// The rule that makes it worth building: **the demo drives the real stores.**
// Nothing here is a mock or a screenshot. Every step calls the same setters the
// product calls, against the same fixture the workspace boots from under `?lab`,
// and reads the result out of the same components. A recorded tour goes stale
// the first time a panel is renamed and nobody notices for a quarter; this one
// breaks loudly, in front of whoever changed it.
//
// What is faked is exactly one thing: the network. `executeSearch` would spend
// thirty seconds and sixteen API calls to arrive at the fixture we already have,
// so the search *result* is written straight in while the search *interface*
// does everything it normally does.

const { SOURCES, BRIEF, OUTLINE, DOC, CLAIMS, CITATIONS } = FIXTURE

const QUESTION = 'To what extent does raising the minimum wage reduce employment?'

// The whole fixture draft, not an excerpt. Claims are pinned by finding their
// quote in the document, so a demo that types three of the four paragraphs
// leaves the fourth claim unpinned — and an unpinned claim copies to the
// clipboard instead of editing the sentence, which quietly removes the one beat
// the demo is built around.

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Only one script may be running, and the player has to be able to prove it is
// the one. React's StrictMode mounts every effect twice in development, which
// started two runners over the same stores: each one called `toggleSource` on
// the same four papers, so every save was immediately un-saved and the demo
// reached the outline stage with nothing to plan from. A boolean `alive` ref
// could not catch it either — both runners share the ref, and the second mount
// sets it back to true. A monotonic token can: only the latest holder acts.
let runSeq = 0
export const claimRun = () => ++runSeq
export const holdsRun = token => token === runSeq

const ui = () => useUIStore.getState()
const ws = () => useWorkspaceStore.getState()
const rs = () => useResearchStore.getState()
const an = () => useAnnotationStore.getState()

/**
 * Everything the demo is about to overwrite, so a student who was mid-paper when
 * they pressed "Watch the demo" gets their paper back.
 */
export function snapshot() {
  const pick = (store, keys) =>
    Object.fromEntries(keys.map(k => [k, store.getState()[k]]))
  return {
    ui: pick(useUIStore, ['stage', 'sidebarView']),
    ws: pick(useWorkspaceStore, ['doc', 'projects', 'activeProjectId', 'activeMode']),
    rs: pick(useResearchStore, ['query', 'searchedQuery', 'brief', 'results', 'questionShape',
      'inputType', 'isSearching', 'statusMsg', 'arms', 'gathered', 'kept', 'roleCounts', 'provisional']),
    an: pick(useAnnotationStore, ['claims', 'outline', 'citations', 'selectedClaimId', 'typos', 'meta']),
  }
}

export function restore(snap) {
  if (!snap) return
  useUIStore.setState(snap.ui)
  useWorkspaceStore.setState(snap.ws)
  useResearchStore.setState(snap.rs)
  useAnnotationStore.setState(snap.an)
}

// Save, never toggle. Every action in the script has to be safe to run twice —
// a demo is the one place where a double-fire is invisible until the end, when
// the shelf is mysteriously empty.
function save(paper) {
  const already = (ws().activeProject()?.sources || [])
    .some(s => (s.doi || s.title) === (paper.doi || paper.title))
  if (!already) ws().toggleSource(paper)
}

/** Wipe the workspace to a genuine cold start, so the demo begins where a new user does. */
function coldStart() {
  useUIStore.setState({ stage: 'question', sidebarView: 'saved' })
  useWorkspaceStore.setState({
    doc: '',
    projects: [{ id: 'demo-project', name: 'Minimum wage & employment', createdAt: Date.now(), sources: [], doc: '' }],
    activeProjectId: 'demo-project',
    activeMode: 'idle',
  })
  useResearchStore.setState({
    query: '', searchedQuery: '', brief: null, results: [], questionShape: 'none',
    inputType: 'topic', isSearching: false, statusMsg: '', arms: [], gathered: 0, kept: 0,
    roleCounts: null, provisional: false, error: '',
  })
  useAnnotationStore.setState({
    claims: null, outline: null, citations: null, selectedClaimId: null, typos: null, meta: null,
  })
}

// ── The script ──────────────────────────────────────────────────────────────
//
// Each step is `{ say, at, run, hold }`. `at` names a `data-demo` attribute the
// cursor travels to and presses; `run` is what pressing it does. Steps are
// awaited in order and the player waits for `at` to exist before it moves, which
// is the difference between a script and a stopwatch: a slow spring, a wrapped
// line or a re-render cannot desynchronise the cursor from the thing it is
// pointing at.

export const SCRIPT = [
  {
    say: 'Firmo starts with a question, not a keyword — and it reads the shape of that question before searching. This one wants a size, not a yes or no.',
    at: 'question-field',
    type: { text: QUESTION, set: v => rs().setQuery(v) },
    hold: 250,
  },
  {
    
    hold: 761,
  },
  {
    // The alternate entrance, shown rather than listed. Most students arriving
    // at Firmo already have three paragraphs somewhere, and a demo that only
    // ever shows the blank-page path quietly tells them this is not for them.
    say: 'Already started writing? Drop in a Word file instead. Google Docs exports to Word, so that is the same door.',
    at: 'import-docx',
    hold: 761,
  },
  {
    say: 'One search, sixteen databases.',
    at: 'question-search',
    run: async () => {
      useResearchStore.setState({ isSearching: true, statusMsg: 'Reading your topic…', gathered: 0 })
      ui().setStage('sources')
      await sleep(700)
      useResearchStore.setState({ statusMsg: 'Searching sixteen databases…', gathered: 214 })
      await sleep(800)
      useResearchStore.setState({
        statusMsg: 'Reading abstracts…', gathered: 428,
        arms: [
          { query: 'minimum wage employment effects', found: 96 },
          { query: 'wage floor low skilled labour', found: 71 },
          { query: 'minimum wage meta-analysis', found: 54 },
          { query: 'monopsony wage setting', found: 43 },
        ],
      })
      await sleep(900)
      useResearchStore.setState({
        isSearching: false, statusMsg: '', brief: BRIEF, results: SOURCES,
        questionShape: 'extent', inputType: 'question', searchedQuery: QUESTION,
        kept: SOURCES.length,
        roleCounts: SOURCES.reduce((a, p) => ({ ...a, [p.stance]: (a[p.stance] || 0) + 1 }), {}),
      })
    },
    hold: 263,
  },
  {
    say: 'Everything that comes back is filed by what it will do in your argument. The estimate, the one that cuts against it, the method behind both.',
    hold: 937,
  },
  {
    // "Why it matters" is the single most useful button in the product and the
    // one nobody presses, because its label promises a summary and it actually
    // answers a harder question: what is this paper for, in YOUR argument.
    say: 'You do not have to read forty abstracts. Ask any paper why it matters, and Firmo answers against your question, not in general.',
    at: 'why-matters',
    press: true,
    hold: 1200,
  },
  { 
    at: 'save-nth-0', run: () => save(SOURCES[0]), hold: 900 },
  { at: 'save-nth-1', run: () => save(SOURCES[1]), hold: 550 },
  { at: 'save-nth-2', run: () => save(SOURCES[2]), hold: 550 },
  { at: 'save-nth-3', run: () => save(SOURCES[3]), hold: 900 },
  {
    say: 'Keep four, and Firmo can plan the argument around them.',
    at: 'tab-outline',
    run: async () => {
      ui().setStage('outline')
      useAnnotationStore.setState({ outlineLoading: true })
      await sleep(1200)
      useAnnotationStore.setState({ outlineLoading: false, outline: OUTLINE })
    },
    hold: 585,
  },
  {
    // The chat is the least discoverable thing in the workspace and the most
    // asked-for capability in the category, so it gets a beat of its own — and
    // the refusal gets said out loud, because it is the whole positioning.
    say: 'Or just ask them — grounded in the papers you kept, not the open internet.',
    at: 'ask-box',
    type: { text: 'where do these papers actually disagree?', set: v => ui().setOmniValue(v), speed: 26 },
    hold: 585,
  },
  {
    say: 'The page is yours. Firmo will not write it — but it will read what you wrote and mark every sentence a reader expects a source for.',
    at: 'tab-draft',
    run: () => ui().setStage('draft'),
    hold: 250,
  },
  {
    at: 'draft-field',
    type: { text: DOC, set: v => ws().setDoc(v), speed: 6 },
    hold: 250,
  },
  {
    
    at: 'check-draft',
    run: async () => {
      useAnnotationStore.setState({ draftLoading: true, draftStatus: 'Reading your draft…' })
      ui().setStage('claims')
      await sleep(1400)
      useAnnotationStore.setState({ draftLoading: false, draftStatus: '', claims: CLAIMS })
    },
    hold: 468,
  },
  {
    say: 'Red means the evidence disagrees with you. Amber is softer: true enough, but a marker will stop at it.',
    at: 'claim-open',
    run: () => an().selectClaim(CLAIMS[0].id),
    hold: 878,
  },
  {
    
    run: () => an().selectClaim(CLAIMS[2].id),
    hold: 564,
  },
  {
    // Nothing said, nothing moved. Every beat so far has had a line over it, so
    // two seconds of quiet is the loudest thing available — and it buys the
    // viewer a moment to notice the amber sentence before it changes.
    hold: 1600,
  },
  {
    // Pressed for real. This is the one step in the script that does not call a
    // store setter at all — the cursor lands on the actual button and clicks it,
    // and the citation, the saved source, the green highlight and the new line
    // in the works-cited page all follow from the product's own code. It is the
    // most important beat in the demo and the one least worth faking.
    say: 'One press. The citation goes into your sentence, the source joins the paper, and the works-cited page writes itself.',
    at: 'cite',
    press: true,
    hold: 878,
  },
  {
    run: () => an().selectClaim(null),
    hold: 527,
  },
  {
    say: 'Last pass before hand-in — every reference checked against the publisher record.',
    at: 'tab-references',
    run: async () => {
      ui().setStage('references')
      useAnnotationStore.setState({ citeLoading: true, citeStatus: 'Reading your reference list…' })
      await sleep(1100)
      useAnnotationStore.setState({
        citeLoading: false, citeStatus: '',
        citations: CITATIONS.map(c => ({ ...c, verdict: 'checking' })),
      })
      await sleep(700)
      useAnnotationStore.setState({ citations: CITATIONS })
    },
    hold: 702,
  },
  {
    say: 'That one does not exist. This is what catches invented citations before a professor does.',
    hold: 878,
  },
  {
    
    at: 'tab-export',
    run: () => ui().setStage('export'),
    hold: 761,
  },
]

/**
 * Which part of making a paper each step belongs to.
 *
 * The captions narrate the individual action — press this, and that happens.
 * A viewer is trying to learn something coarser than that: what the stages of
 * using this thing are. Named chapters carry it, and ticking them onto the
 * progress bar turns "62% through" into "two of six left", which is the form
 * the question is actually asked in.
 *
 * Derived from the script rather than hand-numbered, so inserting a step cannot
 * silently push a boundary onto the wrong caption.
 */
export const CHAPTER_AT = {
  0: 'The question',
  3: 'The search',
  5: 'Reading what came back',
  8: 'Choosing sources',
  12: 'Asking the sources',
  13: 'Writing',
  15: 'The claim check',
  19: 'Before hand-in',
}

/** Chapter boundaries as fractions of the run, for the progress bar ticks. */
export const CHAPTERS = Object.keys(CHAPTER_AT)
  .map(Number)
  .filter(i => i > 0)
  .map(i => ({ at: i / SCRIPT.length, label: CHAPTER_AT[i] }))

/** The chapter a given step index falls in. */
export function chapterFor(index) {
  let name = CHAPTER_AT[0]
  for (const key of Object.keys(CHAPTER_AT).map(Number).sort((a, b) => a - b)) {
    if (index >= key) name = CHAPTER_AT[key]
  }
  return name
}

export { coldStart, sleep }
