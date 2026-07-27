import { motion } from 'framer-motion'

import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedIds } from '../../stores/selectors'
import { paperId } from '../../lib/projects'
import { SPRING } from '../../lib/constants'
import { EmptyNote, ErrorNote, SkeletonCard, StatusLine } from '../ui/primitives'

// View 3: the structural read a writing-centre tutor gives — thesis, whether
// each paragraph earns its place, and whether the other side ever gets an
// answer. This is what the claim pass cannot see.

const SERVES = {
  yes:  { dot: 'bg-brand-500 dark:bg-signal', label: 'Serves the thesis' },
  weak: { dot: 'bg-amber-400', label: 'Loosely connected' },
  no:   { dot: 'bg-red-500', label: 'Off-thesis' },
}

function FoundChip({ ok, yes, no }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase
      tracking-[0.14em] px-2 py-0.5 rounded border ${
        ok
          ? 'text-brand-500 border-brand-500/50 dark:text-signal dark:border-signal/40'
          : 'text-red-500 border-red-500/40'
      }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-brand-500 dark:bg-signal' : 'bg-red-500'}`} />
      {ok ? yes : no}
    </span>
  )
}

export default function ArgumentMap() {
  const doc = useWorkspaceStore(s => s.doc)
  const toggleSource = useWorkspaceStore(s => s.toggleSource)
  const savedIds = useSavedIds()

  const data = useAnnotationStore(s => s.argument)
  const loading = useAnnotationStore(s => s.argLoading)
  const error = useAnnotationStore(s => s.argError)
  const claims = useAnnotationStore(s => s.claims)
  const draftLoading = useAnnotationStore(s => s.draftLoading)
  const draftStatus = useAnnotationStore(s => s.draftStatus)
  const review = useAnnotationStore(s => s.reviewArgument)

  if (draftLoading && !data) {
    return (
      <div className="flex flex-col gap-3">
        <StatusLine>{draftStatus || 'Reading your draft…'}</StatusLine>
        {[0, 1].map(i => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (error) return <ErrorNote onRetry={() => review(doc)}>{error}</ErrorNote>

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-3">
        <StatusLine>Reading your draft the way a tutor would…</StatusLine>
        {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyNote
        title="No draft reviewed yet"
        action={
          claims === null && doc.trim().length > 200 ? (
            <button onClick={() => review(doc)} className="btn-ghost mt-1">Review this draft</button>
          ) : null
        }
      >
        Paste a draft into the document. Firmo maps the thesis, checks that every paragraph
        serves it, and tells you whether you answered the other side.
      </EmptyNote>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={SPRING}
      className="flex flex-col gap-3"
    >
      {data.top_fix && (
        <div className="border-l-2 border-l-brand-500 dark:border-l-signal bg-brand-500/[0.07] rounded-r px-3.5 py-3">
          <span className="eyebrow !text-brand-500 dark:!text-signal block mb-1">Biggest win</span>
          <p className="text-[12.5px] text-t1 leading-relaxed">{data.top_fix}</p>
        </div>
      )}

      <div className="card p-3.5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">Thesis</span>
          <FoundChip ok={data.thesis?.found} yes="Found" no="Missing" />
        </div>
        {data.thesis?.quote && (
          <p className="font-display italic text-[13px] text-t1 leading-relaxed">“{data.thesis.quote}”</p>
        )}
        {data.thesis?.assessment && (
          <p className="text-[11.5px] text-t2 leading-relaxed">{data.thesis.assessment}</p>
        )}
      </div>

      {data.paragraphs?.length > 0 && (
        <div className="card p-3.5 flex flex-col gap-3">
          <span className="eyebrow">Paragraph map</span>
          {data.paragraphs.map((p, i) => {
            const serve = SERVES[p.serves_thesis] || SERVES.yes
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: Math.min(i, 8) * 0.03 }}
                className="flex items-start gap-2.5"
              >
                <span className="record mt-0.5 shrink-0 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span title={serve.label} className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${serve.dot}`} />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-[12.5px] text-t1 leading-snug">{p.summary}</p>
                  {p.note && <p className="text-[11px] text-t2 leading-relaxed">{p.note}</p>}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <div className="card p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">Counterargument</span>
          <FoundChip ok={data.counterargument?.found} yes="Addressed" no="Missing" />
        </div>
        {data.counterargument?.note && (
          <p className="text-[11.5px] text-t2 leading-relaxed">{data.counterargument.note}</p>
        )}

        {data.counter_sources?.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            {/* Retrieval can't guarantee an opposing stance, so this promises a
                starting point for the section, not proven opposition. */}
            <span className="eyebrow !text-amber-600 dark:!text-amber-400">
              For your counterargument section
            </span>
            {data.counter_sources.map((p, i) => {
              const saved = savedIds.has(paperId(p))
              return (
                <div key={paperId(p) || i} className="card px-3 py-2.5 flex flex-col gap-1.5">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      className="text-[12.5px] font-medium text-t1 leading-snug hover:text-brand-500 dark:hover:text-signal transition-colors">
                      {p.title}
                    </a>
                  ) : (
                    <span className="text-[12.5px] font-medium text-t1 leading-snug">{p.title}</span>
                  )}
                  <span className="record">
                    {[p.year, p.journal].filter(Boolean).join(' · ')}
                  </span>
                  <button
                    onClick={() => toggleSource(p)}
                    className={saved ? 'btn-ghost self-start' : 'btn-primary text-xs self-start'}
                  >
                    {saved ? '✓ Saved' : 'Save'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
