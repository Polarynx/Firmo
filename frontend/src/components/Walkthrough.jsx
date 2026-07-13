import { useState } from 'react'

const STEPS = [
  {
    icon: '🎓',
    title: 'Welcome to Firmo',
    body: 'Firmo takes you from a blank page to a finished bibliography. Describe what you\'re writing about and it searches 15 academic databases at once, ranks what it finds, and builds your works-cited page as you collect sources.',
    tip: 'Keep Firmo open in a tab while you write, and your project and bibliography stay put between searches.',
  },
  {
    icon: '🔍',
    title: 'One box, three kinds of input',
    body: 'Type a topic ("microplastics in drinking water"), a thesis ("school uniforms improve focus"), or a research question ("does remote work reduce productivity?"). Firmo detects which one you gave it and adapts: a thesis gets an honest evidence assessment, a topic gets a map of the field.',
    tip: 'Being specific pays off. "Sleep deprivation and memory in college students" beats "sleep".',
  },
  {
    icon: '🧭',
    title: 'The research brief',
    body: 'Every search opens with a brief: what the evidence says, strong angles for your paper, and related topics worth exploring next. Results stream in live underneath while Firmo ranks them.',
    tip: 'The suggested angles are essay outlines in disguise, and each one can be a body paragraph.',
  },
  {
    icon: '🎯',
    title: 'Relevant first, related on request',
    body: 'Firmo reads your topic and ranks sources by meaning, not matching keywords. Sources squarely about your subject appear up front as "Relevant"; broader context sits behind a "Show related & background" button so it never buries the good stuff. Each source is also tagged Supports, Counterpoint, Mixed, or Background.',
    tip: 'Grab at least one "Counterpoint" source and answer it. Addressing the counterargument is what makes an essay strong.',
  },
  {
    icon: '📄',
    title: 'Free PDFs and quality signals',
    body: 'A "Free PDF" badge means a legal open-access copy exists (via Unpaywall), one click to the actual paper. Journal names and citation counts help you judge how established a source is.',
    tip: 'Older paper with thousands of citations? That\'s foundational work, great for your introduction.',
  },
  {
    icon: '🔖',
    title: 'Projects: one per paper',
    body: 'The "Your paper" panel holds a project for each assignment. Bookmark any source and it lands in the active project. Switch projects from the dropdown when you\'re juggling classes.',
    tip: 'Name projects after the assignment ("HIST200 Cold War essay") so future-you can find them.',
  },
  {
    icon: '📚',
    title: 'The works-cited page writes itself',
    body: 'As you save sources, the Works Cited panel builds a real, alphabetized bibliography in APA 7, MLA 9, Chicago, Harvard, or IEEE. Sources with a DOI are formatted from the publisher\'s full record: journal, volume, issue, pages.',
    tip: 'One click on "Copy all" and your reference list is done. Or download .bib / .ris for Zotero and Mendeley.',
  },
  {
    icon: '📝',
    title: 'Check my draft',
    body: 'Switch to "Check my draft" and paste what you\'ve written. Firmo pulls out every factual claim, finds real sources for each, and marks it Well-supported, Uncertain, Contested, or Unsupported, all without leaving the page.',
    tip: 'An "Unsupported" or "Contested" claim is your cue to add a citation or soften the wording before you submit. Its sources are right there to save.',
  },
  {
    icon: '💬',
    title: 'Dig deeper anywhere',
    body: '"Summarize" turns any abstract into one plain sentence. "Why it matters" explains what a paper means for your argument. "Ask a question" answers from your actual sources. And in "Your paper," "Synthesize" weighs everything you\'ve saved against your thesis.',
    tip: 'The synthesis makes a great starting point for a literature-review paragraph, in your own words, of course.',
  },
]

export default function Walkthrough({ onClose }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeInUp"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-ink-900 rounded-[3px] border border-gray-200 dark:border-gray-700 border-t-2 border-t-brand-700 dark:border-t-brand-500 shadow-2xl w-full max-w-lg flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === step ? 'w-6 bg-brand-500' : 'w-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
            aria-label="Close walkthrough"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-4 flex flex-col gap-4 flex-1">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="eyebrow !text-brand-700 dark:!text-brand-400">How Firmo works</span>
              <span className="eyebrow">{step + 1} / {STEPS.length}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl leading-none">{current.icon}</span>
              <h2 className="font-display font-semibold text-xl text-gray-900 dark:text-gray-100 leading-tight">{current.title}</h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{current.body}</p>
          </div>

          <div className="border-l-2 border-l-brand-500 bg-brand-50/60 dark:bg-brand-950/20 rounded-[2px] px-4 py-3">
            <span className="eyebrow !text-brand-700 dark:!text-brand-400 block mb-1">Pro tip</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{current.tip}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {isLast ? (
            <button onClick={onClose} className="btn-primary text-sm px-5">
              Start researching
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="btn-primary text-sm px-5 flex items-center gap-1"
            >
              Next
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
