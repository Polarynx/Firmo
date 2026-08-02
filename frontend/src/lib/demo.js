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
    say: 'Start with a question, not keywords. Firmo reads the shape of it first — this one wants a size, not a yes or no.',
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
    say: 'Already writing? Drop in a Word file instead.',
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
    say: 'Everything comes back filed by what it does for you. The estimate, the one that cuts against it, the method behind both.',
    hold: 937,
  },
  {
    // "Why it matters" is the single most useful button in the product and the
    // one nobody presses, because its label promises a summary and it actually
    // answers a harder question: what is this paper for, in YOUR argument.
    say: 'You do not have to read forty abstracts. Ask any paper why it matters.',
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
    say: 'Keep four and it plans the argument around them.',
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
    say: 'Or just ask them. Grounded in your papers, not the open internet.',
    at: 'ask-box',
    type: { text: 'where do these papers actually disagree?', set: v => ui().setOmniValue(v), speed: 26 },
    hold: 585,
  },
  {
    say: 'The page is yours. Firmo will not write it — but it will read it, and mark every sentence that needs backing.',
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
    say: 'Red means your own evidence disagrees with you. Amber just wants a source.',
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
    say: 'One press. Citation in, source saved, works-cited page updated.',
    at: 'cite',
    press: true,
    hold: 878,
  },
  {
    run: () => an().selectClaim(null),
    hold: 527,
  },
  {
    say: 'Last pass — every reference against the publisher record.',
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
  {
    say: 'Then it leaves as one Word file, works-cited page and all.',
    at: 'tab-export',
    run: () => ui().setStage('export'),
    hold: 1200,
  },
  {
    // The closing line. Not a summary of features — a statement of what the
    // last ninety seconds were actually about, which is the only thing worth
    // saying at the end of a demo.
    say: 'Not a chatbot that writes your essay. A workspace that can prove you wrote it.',
    hold: 1400,
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

const seedIfEmpty = () => {
  if (useResearchStore.getState().results.length) return
  const id = ws().activeProjectId || 'demo-project'
  useWorkspaceStore.setState({
    projects: [{
      id,
      name: ws().activeProject()?.name || 'Minimum wage & employment',
      createdAt: Date.now(),
      sources: SOURCES.slice(0, 5),
      doc: DOC,
    }],
    activeProjectId: id,
    doc: DOC,
  })
  useResearchStore.setState({
    query: QUESTION, searchedQuery: QUESTION, brief: BRIEF, results: SOURCES,
    questionShape: 'extent', inputType: 'question', isSearching: false,
    roleCounts: SOURCES.reduce((a, p) => ({ ...a, [p.stance]: (a[p.stance] || 0) + 1 }), {}),
  })
  useAnnotationStore.setState({ claims: CLAIMS, outline: OUTLINE, citations: CITATIONS })
}

export const TOURS = {
  sources: [
    { run: () => { seedIfEmpty(); ui().setStage('sources') },
      say: 'Sixty papers came back. The useful question is never which one is most relevant.' },
    { say: 'It is what have I got, and what am I missing. So they are stacked by what each one does — estimates, the ones that cut against them, the methods behind both.' },
    { say: 'These are jumps, not filters. Nothing gets hidden, so the counts tell you the truth about the whole search.' },
    { at: 'why-matters', press: true,
      say: 'Not sure about one? Ask why it matters. It answers against your question, not in general.' },
    { at: 'summarize', press: true,
      say: 'Or get the abstract in plain English.' },
    { at: 'save-nth-0', run: () => save(SOURCES[0]),
      say: 'Bookmark it and it goes on the shelf, where it stays for the rest of the paper.' },
    { at: 'save-nth-2', run: () => save(SOURCES[2]),
      say: 'Retracted work gets a red stamp, so you cannot cite it by accident.' },
  ],

  outline: [
    { run: () => { seedIfEmpty(); ui().setStage('outline') },
      say: 'This plans from the sources you kept, not from your topic. That is the difference between a plan and a template.' },
    { at: 'build-outline', press: true,
      say: 'Add your thesis if you have one, and it argues that.' },
    { say: 'Every point names the papers behind it, coloured by what they do. A point backed only by orange is a point argued from the papers that disagree with it.' },
    { at: 'gap-search',
      say: 'No source yet? That is a search, ready to run. Firmo shows you where the argument is not earned yet.' },
    { say: 'It will not plan from fewer than four papers. Two is a guess with a structure drawn on it.' },
  ],

  draft: [
    { run: () => { seedIfEmpty(); ui().setStage('draft') },
      say: 'This is just the page. No marks while you write — a paragraph covered in amber is a paragraph being argued with before it is finished.' },
    { say: 'Got something already? The Question tab opens a Word file straight into here, paragraphs intact. Google Docs exports to Word, so same door.' },
    { say: 'The works-cited page builds itself underneath as you save sources.' },
    { at: 'export-menu',
      say: 'APA, MLA, Chicago, Harvard, IEEE. Switch it and every entry re-sets.' },
    { at: 'check-draft',
      say: 'And when you are ready, Firmo reads it. What it will not do is write it.' },
  ],

  claims: [
    { run: () => { seedIfEmpty(); ui().setStage('claims') },
      say: 'Same page, read instead of written. Every sentence a marker would want a source for is marked where you wrote it.' },
    { say: 'Amber wants a citation. Red means the evidence you saved actually disagrees with you.' },
    { at: 'claim-open', run: () => an().selectClaim(CLAIMS[0].id),
      say: 'Click a red one and Firmo shows you what the paper really says, plus a rewrite you can take.' },
    { run: () => an().selectClaim(CLAIMS[2].id),
      say: 'Click an amber one and the best papers for that exact sentence turn up beside it. Open access? It quotes the page, not the abstract.' },
    { at: 'cite', press: true,
      say: 'One press. Citation into the sentence, source onto the shelf, entry into the works-cited page.' },
    { run: () => an().selectClaim(null),
      say: 'The bar tracks what is settled. Pure opinion counts as done — Firmo checks facts, not style.' },
  ],

  references: [
    { run: () => { seedIfEmpty(); ui().setStage('references') },
      say: 'Paste your reference list and every entry goes to CrossRef and OpenAlex.' },
    { say: 'Four answers: matches, wrong in the details, retracted, or no such paper.' },
    { say: 'Turn a card over to see what the publisher actually has on file.' },
    { say: 'And it knows the difference between your mistake and the index being behind. A paper the register only has a later deposit for is not something you got wrong.' },
    { say: 'If any of these came from a chatbot, this is what catches the invented ones first.' },
  ],

  export: [
    { run: () => { seedIfEmpty(); ui().setStage('export') },
      say: 'Last screen. Its job is to say not yet as often as it says here you go.' },
    { say: 'Unbacked claims and missing references are up top, before the download, not after it.' },
    { at: 'export-menu', press: true,
      say: 'The file still builds either way. Refusing to hand over your own writing would be absurd.' },
    { say: 'One Word document: your prose and its works-cited page, in the style you picked. Or BibTeX and RIS if the sources are going to Zotero.' },
    { say: 'And the process record goes separately — every search, every source, every refusal, hash-chained, checkable without reading a word of your draft.' },
  ],
}

/** The tour for a stage. Question gets the full survey; everything else its own. */
export function tourFor(stage) {
  return stage === 'question' || !TOURS[stage] ? SCRIPT : TOURS[stage]
}

/** True when this is the full survey, which cold-starts rather than seeding. */
export const isFullTour = tour => tour === SCRIPT

export { coldStart, sleep }