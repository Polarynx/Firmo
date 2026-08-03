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

const { SOURCES, BRIEF, OUTLINE, DOC, CLAIMS, CITATIONS, FACETS } = FIXTURE

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
    ws: pick(useWorkspaceStore, ['doc', 'projects', 'activeProjectId', 'activeMode', 'citationStyle']),
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

// How long a caption stays up, from how long it takes to read.
//
// Hand-tuned holds were fine while a voice set the pace and the number was only
// a tail. Without it the hold IS the pacing, and one constant cannot serve both
// "One search. Sixteen databases." and a thirty-word sentence — the short line
// drags and the long one is gone before it is finished. Roughly 200 wpm, with a
// floor for the eye to find the line at all.
export const readingTime = text =>
  Math.min(7000, Math.max(1700, 700 + (text || '').length * 46))

export const SCRIPT = [
  {
    say: 'This is Firmo. You start with a question, not keywords.',
    at: 'question-field',
    type: { text: QUESTION, set: v => rs().setQuery(v) },
    hold: 300,
  },
  {
    say: 'Already have a draft going, or a session from another computer? You can drop that in instead.',
    at: 'import-docx',
    hold: 500,
  },
  {
    say: 'One search. Sixteen databases at once.',
    at: 'question-search',
    run: async () => {
      useResearchStore.setState({ isSearching: true, statusMsg: 'Reading your question…', gathered: 0 })
      await sleep(700)
      useResearchStore.setState({ statusMsg: 'Searching sixteen databases…', gathered: 214 })
      await sleep(800)
      useResearchStore.setState({ statusMsg: 'Reading abstracts…', gathered: 428 })
      await sleep(800)
      useResearchStore.setState({
        isSearching: false, statusMsg: '', brief: BRIEF, results: SOURCES,
        questionShape: 'extent', inputType: 'question', searchedQuery: QUESTION,
        kept: SOURCES.length, facets: FACETS,
        roleCounts: SOURCES.reduce((a, p) => ({ ...a, [p.stance]: (a[p.stance] || 0) + 1 }), {}),
      })
    },
    hold: 700,
  },
  {
    // Firmo no longer moves you when a search finishes, so the demo has to show
    // the thing that replaced it. This beat exists because a viewer who has just
    // watched a search will otherwise wonder where the papers went.
    say: 'It does not drag you anywhere. When you are ready, you go.',
    at: 'next-sources',
    press: true,
    hold: 700,
  },
  {
    say: 'Everything that came back, sorted by what it does for your argument. What backs you up. What pushes back. What says it depends.',
    hold: 1400,
  },
  {
    say: 'And these are what the papers are actually about. Firmo reads the results and names the groups it finds, so you can go straight to the part you need.',
    at: 'facet',
    press: true,
    hold: 1600,
  },
  {
    say: 'Not sure about one? Ask why it matters. You get an answer about your question, not a summary.',
    at: 'why-matters',
    press: true,
    hold: 2400,
  },
  {
    say: 'Keep the ones you want.',
    at: 'save-nth-0',
    run: () => { save(SOURCES[0]); save(SOURCES[1]); save(SOURCES[3]); save(SOURCES[4]) },
    hold: 900,
  },
  {
    say: 'Four is enough for Firmo to plan the argument around them.',
    at: 'tab-outline',
    run: async () => {
      ui().setStage('outline')
      useAnnotationStore.setState({ outlineLoading: true })
      await sleep(1000)
      useAnnotationStore.setState({ outlineLoading: false, outline: OUTLINE })
    },
    hold: 1600,
  },
  {
    say: 'Or just ask. It knows your sources, your outline and whatever you have written so far.',
    at: 'ask-box',
    type: { text: 'where do these papers disagree?', set: v => ui().setOmniValue(v), speed: 26 },
    hold: 1600,
  },
  {
    say: 'Then write. Firmo will not do that part for you.',
    at: 'tab-draft',
    run: () => { ui().setOmniValue(''); ui().setStage('draft') },
    hold: 500,
  },
  {
    at: 'draft-field',
    type: { text: DOC, set: v => ws().setDoc(v), speed: 6 },
    hold: 400,
  },
  {
    say: 'When you want to know what still needs a source, ask it to check.',
    at: 'check-draft',
    run: async () => {
      useAnnotationStore.setState({ draftLoading: true, draftStatus: 'Reading your draft…' })
      await sleep(1300)
      useAnnotationStore.setState({ draftLoading: false, draftStatus: '', claims: CLAIMS })
    },
    hold: 1500,
  },
  {
    say: 'Amber needs a source. Red means the papers you saved actually disagree with what you wrote.',
    at: 'claim-open',
    run: () => an().selectClaim(CLAIMS[2].id),
    hold: 2000,
  },
  {
    // The quiet beat. Everything else has a line over it, so two seconds of
    // nothing is the loudest thing available and it lands the press that follows.
    hold: 1500,
  },
  {
    say: 'One press. The citation goes in, the source is saved, the works cited page updates.',
    at: 'cite',
    press: true,
    hold: 2200,
  },
  {
    say: 'Last check before you hand it in. Every reference, against the publisher record.',
    at: 'tab-references',
    run: async () => {
      an().selectClaim(null)
      ui().setStage('references')
      useAnnotationStore.setState({ citeLoading: true, citeStatus: 'Reading your reference list…' })
      await sleep(1000)
      useAnnotationStore.setState({
        citeLoading: false, citeStatus: '',
        citations: CITATIONS.map(c => ({ ...c, verdict: 'checking' })),
      })
      await sleep(700)
      useAnnotationStore.setState({ citations: CITATIONS })
    },
    hold: 1800,
  },
  {
    say: 'That one does not exist. This is what catches made up citations before your professor does.',
    hold: 1800,
  },
  {
    say: 'Then it all leaves as one Word file. Your writing and your works cited page, in the style you picked.',
    at: 'tab-export',
    run: () => ui().setStage('export'),
    hold: 1600,
  },
  {
    say: 'Or save the whole session to a file, and pick it up on another computer or hand it to someone you are working with.',
    at: 'export-session',
    hold: 1800,
  },
  {
    say: 'That is Firmo. Not a chatbot that writes your essay, but a workspace that can prove you wrote it.',
    hold: 1600,
  },
]


// ── The focused tours ───────────────────────────────────────────────────────
//
// The home tour is a survey: ninety seconds, the whole arc, nothing in depth.
// That is the right shape for someone deciding whether Firmo is for them, and
// the wrong shape for someone standing in the Sources tab wondering what the
// coloured chips mean.
//
// So every other stage has its own. They are short — four or five beats — and
// they cover what is actually on that screen rather than repeating the arc.
// Pressing the walkthrough button asks about the room you are standing in.
//
// Unlike the home tour these do NOT cold-start. A student opens one because
// they are stuck partway through a real paper, and wiping that to show them a
// fixture would be a strange way to answer the question. They run against
// whatever is on screen, seeding the fixture only when the stage is empty and
// there would otherwise be nothing to point at.

/**
 * Put the demo's own example paper on screen, always.
 *
 * This used to seed only when the stage was empty, so a tour opened by someone
 * with real work ran against THEIR paper — which is why half the controls did
 * nothing useful. "Why it matters" needs a query and an abstract and a live
 * model, and returned "couldn't analyze that" when any of them was missing;
 * "Build outline" refused below four sources; the claim beats had no claims to
 * click. The walkthrough was demonstrating whatever state the viewer happened to
 * be in, which for a new user is nothing at all.
 *
 * So every tour now brings its own world: one question, six results, a draft,
 * three claims, a reference list. The student's own work is snapshotted before
 * any of this and restored when the tour ends, so nothing is lost by watching.
 */
const seedDemo = () => {
  useWorkspaceStore.setState({
    projects: [{
      id: 'demo-project',
      name: 'Minimum wage & employment',
      createdAt: Date.now(),
      sources: SOURCES.slice(0, 5),
      doc: DOC,
    }],
    activeProjectId: 'demo-project',
    doc: DOC,
    activeMode: 'idle',
  })
  useResearchStore.setState({
    query: QUESTION, searchedQuery: QUESTION, brief: BRIEF, results: SOURCES,
    questionShape: 'extent', inputType: 'question', isSearching: false,
    provisional: false, error: '', statusMsg: '',
    roleCounts: SOURCES.reduce((a, p) => ({ ...a, [p.stance]: (a[p.stance] || 0) + 1 }), {}),
    arms: [
      { query: 'minimum wage employment effects', found: 96 },
      { query: 'wage floor low skilled labour', found: 71 },
      { query: 'minimum wage meta-analysis', found: 54 },
      { query: 'monopsony wage setting', found: 43 },
    ],
    gathered: 428, kept: SOURCES.length, stage: 'done',
    facets: FACETS,
    activeFacet: null,
  })
  useAnnotationStore.setState({
    claims: CLAIMS, outline: OUTLINE, citations: CITATIONS,
    selectedClaimId: null, typos: null, meta: null,
    draftLoading: false, outlineLoading: false, citeLoading: false,
  })
}

export const TOURS = {
  sources: [
    { run: () => { seedDemo(); ui().setStage('sources') },
      say: 'Sixty papers came back. The question is never which one is best.' },
    { say: 'It is what have I got, and what am I missing. So they are stacked by what each one does for you.' },
    { say: 'Backs your point. Pushes back. It depends. How it is studied. Background. Same five every time, so you only learn them once.' },
    { at: 'facet', press: true,
      say: 'These are what the papers are about. Firmo reads the results and names the groups it finds, so you can jump to the part you need.' },
    { at: 'facet', press: true,
      say: 'Press it again to see everything.' },
    { say: 'You can also cut by year, if your professor wants recent work.' },
    { at: 'why-matters', press: true,
      say: 'Ask any paper why it matters and the answer is about your question, not the paper in general.' },
    { at: 'summarize', press: true,
      say: 'Or get the abstract in plain English.' },
    { at: 'retracted-card',
      say: 'Retracted work gets a red do not cite mark. This one was pulled after the numbers turned out to be wrong, and it is still floating around.' },
    { at: 'save-nth-0', run: () => save(SOURCES[0]),
      say: 'Bookmark what you want. It goes on the shelf and stays there for the rest of the paper.' },
  ],

  outline: [
    { run: () => { seedDemo(); ui().setStage('outline') },
      say: 'This plans from the papers you kept, not from your topic. That is the difference between a plan and a template.' },
    { at: 'build-outline', press: true,
      say: 'Add your thesis if you have one and it will argue that.' },
    { say: 'Every point shows the papers behind it, coloured by what they do. A point held up only by orange is a point you are arguing from the papers that disagree with you.' },
    { at: 'gap-search',
      say: 'No source yet? That is a search, ready to go. It shows you where your argument is not earned.' },
    { say: 'It will not plan from fewer than four papers. Two is a guess with a shape drawn around it.' },
  ],

  draft: [
    { run: () => { seedDemo(); ui().setStage('draft') },
      say: 'Writing and checking are the same tab now, because that is how you actually work.' },
    { at: 'check-draft', press: true,
      say: 'Write however you like, then ask Firmo to check it.' },
    { say: 'Amber needs a source. Red means your own saved papers disagree with you, and it shows you what they say.' },
    { at: 'claim-open', run: () => an().selectClaim(CLAIMS[2].id),
      say: 'Click a mark and the best papers for that exact sentence turn up beside it.' },
    { at: 'cite', press: true,
      say: 'One press. Citation in, source saved, works cited page updated.' },
    { at: 'toggle-marks', press: true, run: () => an().selectClaim(null),
      say: 'Hide the marks when you want to write again. Same page, nothing lost.' },
    { at: 'style-menu', press: true,
      say: 'APA, MLA, Chicago, Harvard, IEEE. Change it and every citation reformats itself.' },
  ],

  references: [
    { run: () => { seedDemo(); ui().setStage('references') },
      say: 'Paste your reference list and every entry goes off to CrossRef and OpenAlex.' },
    { say: 'Four answers. It matches. The details are wrong. It was retracted. Or there is no such paper.' },
    { say: 'Turn a card over to see what the publisher actually has on file.' },
    { say: 'It also knows the difference between your mistake and the index being behind, so it will not tell you a real paper is fake.' },
    { say: 'If any of these came from a chatbot, this is what catches the made up ones first.' },
  ],

  export: [
    { run: () => { seedDemo(); ui().setStage('export') },
      say: 'Last screen. Its job is to say not yet as often as it says here you go.' },
    { say: 'Anything unbacked or unmatched is up here, before the download, not after.' },
    { at: 'export-docx',
      say: 'Then one Word file. Your writing and your works cited page together, in the style you picked.' },
    { at: 'export-session', press: true,
      say: 'Or save the whole session. Question, sources, outline, draft, everything, in one file you can open on another computer.' },
    { say: 'That is how you carry a paper between machines, or hand it to someone working on it with you.' },
    { at: 'open-record', press: true,
      say: 'And the process record travels on its own.' },
    { run: () => ui().setShowRecord(false),
      say: 'Every search, every source, every time Firmo refused to write. Your professor can check how the paper was made without reading a word of it.' },
  ],
}

/** The tour for a stage. Question gets the full survey; everything else its own. */
export function tourFor(stage) {
  return stage === 'question' || !TOURS[stage] ? SCRIPT : TOURS[stage]
}

/** True when this is the full survey, which cold-starts rather than seeding. */
export const isFullTour = tour => tour === SCRIPT

export { coldStart, sleep }