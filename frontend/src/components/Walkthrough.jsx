import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SPRING } from '../lib/constants'

const STEPS = [
  {
    icon: '⌘',
    title: 'One page, not five tools',
    body: 'Firmo is a single workspace. The document is in the middle, everything Firmo has to say about it is on the right, and the rail on the left is the paper itself — Question, Sources, Outline, Draft, Claims, References, Export. Press any stage to go there. Nothing is locked, so you can go back to Sources from halfway through a draft and return.',
    tip: 'Press ⌘K from anywhere to jump to the bar. ⌘↵ in the document runs whatever Firmo thinks you want.',
  },
  {
    icon: '✍️',
    title: 'The document reads your intent',
    body: 'Type a topic and press ⌘↵ and Firmo searches sixteen academic databases. Paste a draft and it starts marking claims. Paste a reference list and it starts verifying entries. You never pick a mode.',
    tip: 'Being specific pays off. "Sleep deprivation and memory in college students" beats "sleep".',
  },
  {
    icon: '🎯',
    title: 'Sources, ranked by meaning',
    body: 'Firmo ranks by what your topic means, not which keywords match, and files every source by what it will do in your paper — the finding, the one that cuts against it, the one saying it depends, the method behind both. The words change with your question: ask how effective something is and you get Effect estimate and Null or reversed. Retracted papers get a red do-not-cite stamp.',
    tip: 'Grab a Counterpoint source and answer it. Addressing the other side is what makes an essay strong.',
  },
  {
    icon: '🖍️',
    title: 'Claims, marked where you wrote them',
    body: 'After a draft check, every factual claim is highlighted in your own text. Amber needs a citation, red means the evidence disagrees, green means a saved source already covers it, and a dotted underline means no citation is needed.',
    tip: 'Click any highlight. The panel on the right fills with the three best papers for that exact sentence.',
  },
  {
    icon: '⚡',
    title: 'Cite and save, in one click',
    body: 'From a highlighted claim, "Cite & save" drops the in-text citation into your sentence, adds the source to your project, turns the highlight green, and updates the works-cited page at the foot of the document. One action, four results.',
    tip: 'Switch between APA 7, MLA 9, Chicago, Harvard, and IEEE at the bibliography and everything re-sets itself.',
  },
  {
    icon: '🧭',
    title: 'The argument, read like a tutor would',
    body: 'The Claims stage maps your thesis, marks whether each paragraph earns its place, and names the objection your particular draft owes its reader — the opposing evidence for an argument, the null result for a question of degree, the item left out of a list — then hands you sources for it.',
    tip: 'The Outline panel turns your saved sources into a point-by-point plan, and flags every point with no evidence yet.',
  },
  {
    icon: '🧾',
    title: 'The last check before you submit',
    body: 'Paste your finished reference list and Firmo checks every entry against publisher records: wrong years, mangled titles, retracted papers, and citations that do not exist at all.',
    tip: 'Got sources from an AI chatbot? This is the pass that catches the invented ones before your professor does.',
  },
  {
    icon: '💬',
    title: 'Ask your sources',
    body: 'The bottom bar is a chat grounded in the sources you actually saved. Ask where they disagree, get your paper outlined, find the gap in your evidence. Answers float out as cards you can drag onto the page or throw away.',
    tip: 'It explains and plans, but it never writes your prose. That part stays yours, which is the point.',
  },
]

export default function Walkthrough({ onClose }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
        className="glass w-full max-w-lg flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Step ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === step ? 'w-6 bg-brand-500 dark:bg-signal' : 'w-1.5 bg-line hover:bg-edge'
                }`}
              />
            ))}
          </div>
          <button onClick={onClose} className="text-t3 hover:text-t1 transition-colors p-1 text-sm" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="px-6 pb-4 flex flex-col gap-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14, transition: { duration: 0.12 } }}
              transition={SPRING}
              className="flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="eyebrow !text-brand-500 dark:!text-signal">How Firmo works</span>
                <span className="eyebrow">{step + 1} / {STEPS.length}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-xl leading-none">{current.icon}</span>
                <h2 className="font-display font-semibold text-xl text-t1 leading-tight">{current.title}</h2>
              </div>
              <p className="text-[13.5px] text-t2 leading-relaxed">{current.body}</p>

              <div className="border-l-2 border-l-brand-500 dark:border-l-signal bg-brand-500/[0.07] rounded-r px-3.5 py-2.5 mt-1">
                <span className="eyebrow !text-brand-500 dark:!text-signal block mb-1">Pro tip</span>
                <p className="text-[12.5px] text-t1 leading-relaxed">{current.tip}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between px-6 py-3.5 border-t border-line">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="text-[12.5px] text-t2 hover:text-t1 disabled:opacity-30 transition-colors"
          >
            ← Back
          </button>
          {isLast ? (
            <button onClick={onClose} className="btn-primary text-xs">Start writing</button>
          ) : (
            <button onClick={() => setStep(s => s + 1)} className="btn-primary text-xs">Next →</button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
