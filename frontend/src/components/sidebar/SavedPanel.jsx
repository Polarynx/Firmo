import { motion } from 'framer-motion'

import { useResearchStore } from '../../stores/useResearchStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedSources } from '../../stores/selectors'
import { readStages, nextMove } from '../../lib/stages'
import { SPRING } from '../../lib/constants'
import { EmptyNote } from '../ui/primitives'
import Shelf from '../ui/Shelf'
import RecordReceipt from '../workspace/RecordReceipt'

// ── Where the paper stands ──────────────────────────────────────────────────
//
// The shelf, and then an account of the work.
//
// This panel used to be the shelf followed by a list of the same sources the
// shelf was already showing — the collection drawn twice, once as spines and
// once as titles, in a column three hundred pixels wide. The second copy was
// the least useful thing on screen and it occupied the most space.
//
// What belongs there is the thing no other surface says: what has actually been
// done to this paper, and what is worth doing next. Every stage knows its own
// state; nothing was collecting those into one answer, so a student halfway
// through had to visit six tabs to work out where they were.

const TICK = 'text-brand-600 dark:text-signal'

function Row({ done, children }) {
  return (
    <li className="flex items-baseline gap-2.5 text-[12px] leading-relaxed">
      <span className={`shrink-0 font-mono text-[10px] ${done ? TICK : 'text-t3/50'}`}>
        {done ? '✓' : '·'}
      </span>
      <span className={done ? 'text-t2' : 'text-t3'}>{children}</span>
    </li>
  )
}

export default function SavedPanel() {
  const sources = useSavedSources()
  const shape = useResearchStore(s => s.questionShape)
  const setStage = useUIStore(s => s.setStage)

  // Subscribed so the account re-reads as the paper changes.
  useWorkspaceStore(s => s.doc)
  useWorkspaceStore(s => s.projects)
  useResearchStore(s => s.brief)
  useAnnotationStore(s => s.claims)
  useAnnotationStore(s => s.outline)
  useAnnotationStore(s => s.citations)

  const st = readStages()
  const move = nextMove(st)

  const nothingYet = !st.question.count && st.question.state === 'empty'
    && sources.length === 0 && st.draft.state === 'empty'

  if (nothingYet) {
    return (
      <EmptyNote
        title="Nothing here yet"
        action={
          <button onClick={() => setStage('question')} className="btn-ghost mt-1">
            Start with a question
          </button>
        }
      >
        As you search, save sources and write, this panel keeps score: what is done, what is
        still open, and the one thing most worth doing next.
      </EmptyNote>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Shelf
        sources={sources}
        shape={shape}
        onOpen={p => window.open(p.url || (p.doi ? `https://doi.org/${p.doi}` : '#'), '_blank')}
      />

      <div className="flex flex-col gap-2">
        {/* Not "Where this paper stands" - that is the panel's own title,
            two inches above, and reading it twice makes the checklist look like
            a second panel rather than the contents of this one. */}
        <span className="eyebrow">Progress</span>
        <ul className="flex flex-col gap-1.5">
          <Row done={st.question.state === 'done'}>
            {st.question.state === 'done'
              ? 'Question asked, and Firmo has read it'
              : 'No question yet'}
          </Row>
          <Row done={sources.length > 0}>
            {sources.length
              ? `${sources.length} source${sources.length === 1 ? '' : 's'} on the shelf`
              : 'No sources saved'}
          </Row>
          <Row done={st.outline.state !== 'empty'}>
            {st.outline.note || 'No outline yet'}
          </Row>
          <Row done={st.draft.state === 'done'}>
            {st.draft.note || 'Nothing written yet'}
          </Row>
          <Row done={st.references.state === 'done'}>
            {st.references.note || 'References not checked'}
          </Row>
        </ul>
      </div>

      {/* The one thing worth doing next, if there is one. `nextMove` returns
          null far more often than it returns a suggestion, which is what keeps
          this from becoming a checklist that nags. */}
      {move && (
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          onClick={() => setStage(move.stage)}
          className="group flex flex-col gap-1.5 rounded-lg border border-brand-500/30
            bg-brand-500/[0.06] px-3.5 py-3 text-left hover:bg-brand-500/[0.11] transition-colors"
        >
          <span className="eyebrow !text-brand-600 dark:!text-signal">Next</span>
          <span className="text-[12px] text-t1 leading-relaxed">{move.text}</span>
          <span className="text-[11.5px] font-medium text-brand-600 dark:text-signal
            group-hover:translate-x-0.5 transition-transform">
            {move.label} →
          </span>
        </motion.button>
      )}

      {/* What the work adds up to. Below the next move, because what to do now
          outranks what you have already done. */}
      <RecordReceipt />

      {/* The shelf shows what is there; this is the way to change it. A list of
          titles is not, which is why the list that used to live here is gone. */}
      {sources.length > 0 && (
        <button onClick={() => setStage('sources')} className="btn-ghost w-full">
          Manage sources
        </button>
      )}
    </div>
  )
}
