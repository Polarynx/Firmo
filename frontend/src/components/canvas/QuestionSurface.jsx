import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { useResearchStore } from '../../stores/useResearchStore'
import { useUIStore } from '../../stores/useUIStore'
import { guessShape } from '../../lib/claims'
import { EXAMPLE_TOPICS } from '../../lib/constants'

import BriefBlock from './BriefBlock'
import DocumentDrop from './DocumentDrop'
import NextStep from '../workspace/NextStep'

// ── Stage 1: the question ───────────────────────────────────────────────────
//
// What the student is asking, and what kind of answer it wants. This used to be
// the top of one long column that also held the editor, the claim counts and the
// works-cited page, so a blank paper and a finished one were the same screen at
// different scroll positions. It is its own surface now: one field, one
// invitation, and the brief once Firmo has read the question.
//
// The field here is *not* the document. Typing a topic used to write it into the
// draft, which meant every paper began with its own research question sitting at
// the top of page one waiting to be deleted.

// ── The opening sequence ───────────────────────────────────────────────────
// The empty surface plays once, as one orchestrated take. `EASE` is a long,
// decelerating curve — things here settle like objects coming to rest, they do
// not bounce.
const EASE = [0.16, 1, 0.3, 1]

const HERO = {
  rest: {},
  run: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
}

// The rule is ruled, left to right.
const RULE = {
  rest: { scaleX: 0 },
  run: { scaleX: 1, transition: { duration: 0.7, ease: EASE } },
}

// A line of type rising into its slug. The wrapper clips it.
const LINE = {
  rest: { y: '110%' },
  run: { y: '0%', transition: { duration: 0.75, ease: EASE } },
}

const FADE_UP = {
  rest: { opacity: 0, y: 10 },
  run: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
}

// One example, drawn fresh. Not the same one twice in a row within a session,
// because a line that returns what you just read reads as broken.
let lastExample = null
function pickExample() {
  if (EXAMPLE_TOPICS.length < 2) return EXAMPLE_TOPICS[0]
  let next
  do { next = EXAMPLE_TOPICS[Math.floor(Math.random() * EXAMPLE_TOPICS.length)] }
  while (next === lastExample)
  lastExample = next
  return next
}

export default function QuestionSurface() {
  const reduceMotion = useReducedMotion()

  const query = useResearchStore(s => s.query)
  const setQuery = useResearchStore(s => s.setQuery)
  const executeSearch = useResearchStore(s => s.executeSearch)
  const isSearching = useResearchStore(s => s.isSearching)
  const cancel = useResearchStore(s => s.cancel)
  const brief = useResearchStore(s => s.brief)
  const searchError = useResearchStore(s => s.error)
  const results = useResearchStore(s => s.results)
  const setStage = useUIStore(s => s.setStage)
  const setShowWalkthrough = useUIStore(s => s.setShowWalkthrough)

  const inputRef = useRef(null)

  // A different example every few seconds, unasked.
  //
  // The pool exists to seed ideas while the student is still deciding what to
  // type, and an example behind a button is one most people never see. So it
  // rotates on its own — slowly, and only while nobody is looking at it. The one
  // real hazard is a line that changes mid-read, which the hover pause handles:
  // point at it and it holds still until you leave.
  const [example, setExample] = useState(pickExample)
  const [paused, setPaused] = useState(false)

  const heroVisible = !brief && !isSearching

  useEffect(() => {
    if (!heroVisible || paused || reduceMotion) return
    const id = setInterval(() => setExample(pickExample), 7000)
    return () => clearInterval(id)
  }, [heroVisible, paused, reduceMotion])

  const shapeHint = useMemo(() => guessShape(query), [query])

  function submit(text) {
    const q = (text ?? query).trim()
    if (!q) return
    setQuery(q)
    executeSearch(q)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 pt-12 pb-56 flex flex-col gap-7">
      {heroVisible && (
        <motion.div
          variants={HERO}
          // Reduced motion gets the finished frame, not a faster take: the
          // sequence is the point, and half of it is worse than none.
          initial={reduceMotion ? 'run' : 'rest'}
          animate="run"
          className="flex flex-col gap-5"
        >
          <div className="pb-2">
            <span className="eyebrow">Firmo · working paper</span>
            <motion.div variants={RULE} className="mt-3 h-px bg-hair/20 origin-left" />
          </div>

          {/* Each line is clipped by its own wrapper so the type rises into
              place, the way a line of metal type drops into a stick. */}
          <h1 className="font-display font-semibold text-[2.6rem] sm:text-[3.5rem]
            leading-[0.98] text-t1 max-w-[15ch]">
            <span className="block overflow-hidden pb-[0.06em]">
              <motion.span variants={LINE} className="block">Every claim,</motion.span>
            </span>
            <span className="block overflow-hidden pb-[0.06em]">
              <motion.span variants={LINE} className="block">
                {/* The full stop lives inside the italic run. Kerning never
                    crosses an element boundary, so a roman period parked after
                    </span> gets no pair with the italic "r" and floats away from
                    it — invisible at 14px, a hole at 56px. */}
                <span className="display-italic font-normal">accounted for.</span>
              </motion.span>
            </span>
          </h1>

          <motion.p variants={FADE_UP}
            className="text-[14.5px] text-t2 leading-relaxed max-w-[48ch]">
            Type a question and Firmo searches fourteen databases, files every source by what
            it will do in your paper, and checks every citation you end up with against the
            publisher's record.
          </motion.p>

          {/* The demo, offered where the person who needs it is standing. It
              used to live behind a "?" in the corner, which is another way of
              saying it did not exist. */}
          <motion.button
            variants={FADE_UP}
            onClick={() => setShowWalkthrough(true)}
            className="group self-start flex items-center gap-2 text-[12.5px] font-medium
              text-t2 hover:text-t1 transition-colors"
          >
            <span className="grid place-items-center w-5 h-5 rounded-full border
              border-hair/25 group-hover:border-brand-500 dark:group-hover:border-signal
              transition-colors text-[8px] leading-none pl-[2px]">▶</span>
            Watch it work, in 60 seconds
          </motion.button>
        </motion.div>
      )}

      {/* The field. One way in. */}
      <motion.div
        variants={FADE_UP}
        initial={reduceMotion || !heroVisible ? false : 'rest'}
        animate="run"
        className="flex flex-col gap-2.5"
      >
        <label htmlFor="firmo-question" className="eyebrow">Your research question</label>
        {/* The lamp tightens on the field while it has the caret. The page has
            one input that matters and this is it; a focus ring drawn in accent
            blue would be a form control, where this should read as the light
            moving to what you are doing. */}
        <div className="sheet flex items-end gap-3 px-5 py-4 transition-shadow duration-500
          focus-within:shadow-[0_0_0_1px_rgb(var(--lamp)/0.22),0_18px_50px_-24px_rgb(var(--lamp)/0.30)]">
          <textarea
            id="firmo-question"
            ref={inputRef}
            data-demo="question-field"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            rows={2}
            placeholder="How much does sleep loss affect memory in college students?"
            className="flex-1 min-w-0 resize-none bg-transparent outline-none border-0
              font-display text-[19px] leading-snug text-t1 placeholder:text-t3/70"
          />
          {isSearching ? (
            <button onClick={cancel} className="btn-ghost shrink-0 hover:!border-red-400/60 hover:!text-red-400">
              Stop
            </button>
          ) : (
            <motion.button
              data-demo="question-search"
              onClick={() => submit()}
              disabled={!query.trim()}
              whileHover={query.trim() ? { y: -1 } : undefined}
              whileTap={query.trim() ? { scale: 0.97 } : undefined}
              className="btn-primary text-xs py-1.5 shrink-0"
            >
              Search
              <span className="ml-2 opacity-55 font-mono text-[10px]">↵</span>
            </motion.button>
          )}
        </div>

        {/* What kind of question Firmo thinks this is. The more specific and
            more useful of the two readings it could offer: "reads like a topic"
            tells a student nothing they did not know, while "the answer is an
            effect size, not a yes" changes what they go looking for. */}
        <AnimatePresence>
          {query.trim().length > 12 && shapeHint?.hint && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[11.5px] text-t3 leading-relaxed"
            >
              {shapeHint.hint}
            </motion.p>
          )}
        </AnimatePresence>

        {/* The other way in, at caption weight, and permanent.
            It used to hide the moment someone started typing, on the theory
            that they had chosen their route. That is right for a Word file and
            wrong for a session: importing one is not an alternative to asking a
            question, it is how you resume work you already did, and hiding it
            behind an empty field made it findable only by people who did not
            need it yet. */}
        <DocumentDrop />
      </motion.div>

      {/* One invitation, and it changes on its own.
          A row of three fixed examples reads as a menu of the things Firmo can
          do; a single line that keeps changing reads as an invitation to ask
          something of your own. It rotates without being asked because the point
          is to seed ideas while the student is still deciding — a button they
          have to press is a button most people never press. */}
      {heroVisible && !query.trim() && (
        <div
          className="flex flex-col gap-1 pt-1"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <span className="record">Try</span>
          <AnimatePresence mode="wait">
            <motion.button
              key={example}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE }}
              onClick={() => { setQuery(example); submit(example) }}
              whileHover={{ x: 5 }}
              className="group flex items-baseline gap-3 py-1.5 text-left"
            >
              <span className="font-display text-[17px] text-t2 group-hover:text-t1
                transition-colors leading-snug">{example}</span>
              <span className="ml-auto shrink-0 record opacity-0 group-hover:opacity-100
                transition-opacity">↵</span>
            </motion.button>
          </AnimatePresence>
        </div>
      )}

      {/* The brief, once Firmo has read the question. */}
      <BriefBlock />

      {/* The way forward, once there is somewhere to go. This replaced a small
          ghost link that said the same thing and was routinely missed. */}
      {brief && !isSearching && (
        <NextStep
          to="sources"
          label={results.length ? `See the ${results.length} sources that came back` : 'See what came back'}
          hint="Filed by what each one does for your argument. Bookmark the ones you will use."
        />
      )}

      {searchError === 'invalid_query' ? (
        <div className="card p-4 flex flex-col gap-1.5">
          <p className="text-sm font-medium text-t1">Firmo needs a research subject</p>
          <p className="text-xs text-t2 leading-relaxed">
            Try a topic ("microplastics in drinking water"), a thesis ("school uniforms
            improve focus"), or a question ("does remote work reduce productivity?").
          </p>
        </div>
      ) : searchError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-4 py-3
          text-xs text-red-600 dark:text-red-300">
          {searchError}
        </div>
      ) : null}
    </div>
  )
}
