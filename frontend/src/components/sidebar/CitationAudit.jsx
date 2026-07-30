import { motion } from 'framer-motion'

import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { VERDICT, VERDICT_ORDER, SPRING } from '../../lib/constants'
import { Chip, EmptyNote, ErrorNote, SkeletonCard, StatusLine } from '../ui/primitives'

// View 4: the last check before hand-in. Every entry in a pasted reference list
// goes to CrossRef and OpenAlex, and comes back verified, wrong in the details,
// retracted, or absent from the record entirely.

export default function CitationAudit() {
  const items = useAnnotationStore(s => s.citations)
  const loading = useAnnotationStore(s => s.citeLoading)
  const status = useAnnotationStore(s => s.citeStatus)
  const error = useAnnotationStore(s => s.citeError)

  if (error) return <ErrorNote>{error}</ErrorNote>

  if (!items && loading) {
    return (
      <div className="flex flex-col gap-3">
        <StatusLine>{status || 'Reading your reference list…'}</StatusLine>
        {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (!items) {
    return (
      <EmptyNote title="Nothing audited yet">
        Paste a finished works-cited list into the document. Firmo checks every entry against
        publisher records, which is how invented citations get caught before a professor
        finds them.
      </EmptyNote>
    )
  }

  const counts = items.reduce((acc, it) => {
    acc[it.verdict] = (acc[it.verdict] || 0) + 1
    return acc
  }, {})

  const suspect = (counts.not_found || 0) + (counts.retracted || 0)

  return (
    <div className="flex flex-col gap-3">
      {loading && <StatusLine>{status}</StatusLine>}

      <div className="flex flex-col gap-2">
        <span className="eyebrow">
          {items.length === 0
            ? 'No citation entries found in that text'
            : `${items.length} entr${items.length !== 1 ? 'ies' : 'y'} checked`}
        </span>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {VERDICT_ORDER.filter(k => counts[k]).map(k => (
              <Chip key={k} tone={VERDICT[k]} count={counts[k]} />
            ))}
          </div>
        )}
      </div>

      {suspect > 0 && !loading && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3.5 py-3">
          <p className="text-[11.5px] text-red-600 dark:text-red-300 leading-relaxed">
            {suspect} entr{suspect !== 1 ? 'ies' : 'y'} could not be matched to a real published
            record, or has been retracted. Fix these before you submit.
          </p>
        </div>
      )}

      {items.map((it, i) => {
        const tone = VERDICT[it.verdict] || VERDICT.checking
        return (
          <motion.div
            key={i}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: Math.min(i, 8) * 0.03 }}
            className={`card p-3.5 flex flex-col gap-2 border-l-2 ${tone.rail}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-[10.5px] text-t2 leading-relaxed break-words min-w-0">
                {it.raw}
              </p>
              {/* The verdict lands as a stamp. This is the one place in the
                  workspace where a machine has just finished judging something
                  the student wrote, and it should read that way. Still
                  checking? Then nothing has been decided, so nothing lands. */}
              <span className="shrink-0">
                <Chip tone={tone} land={it.verdict !== 'checking'} />
              </span>
            </div>
            {it.note && <p className="text-[11px] text-t2 leading-relaxed">{it.note}</p>}
            {it.matched?.url && (
              <a href={it.matched.url} target="_blank" rel="noopener noreferrer"
                className="self-start text-[11px] font-medium text-brand-500 dark:text-signal hover:opacity-75 transition-opacity">
                View the published record ↗
              </a>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
