import { AnimatePresence, motion } from 'framer-motion'
import { useResearchStore } from '../../stores/useResearchStore'
import { SPRING } from '../../lib/constants'
import { SkeletonLines } from '../ui/primitives'
import StreamingText from '../ui/StreamingText'

const TYPE_LABELS = {
  topic: 'Topic',
  thesis: 'Thesis',
  question: 'Research question',
}

// The research brief: what the evidence says, angles worth arguing, and where
// to look next. It sits above the document because it is the thing the student
// reads before writing a word.

export default function BriefBlock() {
  const brief = useResearchStore(s => s.brief)
  const isSearching = useResearchStore(s => s.isSearching)
  const executeSearch = useResearchStore(s => s.executeSearch)
  const error = useResearchStore(s => s.error)

  const pending = isSearching && !brief && !error

  return (
    <AnimatePresence initial={false}>
      {pending && (
        <motion.div
          key="brief-skeleton"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={SPRING}
          className="card p-5 flex flex-col gap-3"
        >
          <div className="skeleton h-2.5 w-28" />
          <SkeletonLines lines={3} />
        </motion.div>
      )}

      {brief && !error && (
        <motion.div
          key="brief"
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={SPRING}
          className="card p-5 flex flex-col gap-4 border-t-2 border-t-brand-500 dark:border-t-signal/70"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow !text-brand-500 dark:!text-signal">Research brief</span>
              {TYPE_LABELS[brief.input_type] && (
                <span className="eyebrow">{TYPE_LABELS[brief.input_type]}</span>
              )}
            </div>
            <StreamingText
              text={brief.brief || ''}
              caret
              className="font-display text-[15px] leading-relaxed text-t1"
            />
          </div>

          {Array.isArray(brief.angles) && brief.angles.filter(a => a?.title).length > 0 && (
            <div className="flex flex-col gap-2.5 pt-3 border-t border-line">
              <span className="eyebrow">Strong angles for your paper</span>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {brief.angles.filter(a => a?.title).map((a, i) => (
                  <div key={i} className="flex flex-col gap-0.5 border-l border-line pl-3">
                    <p className="text-xs font-semibold text-t1">{a.title}</p>
                    {a.why && <p className="text-xs text-t2 leading-relaxed">{a.why}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(brief.related) && brief.related.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-line">
              <span className="eyebrow shrink-0">Explore next</span>
              {brief.related.map((r, i) => (
                <motion.button
                  key={i}
                  whileHover={{ y: -1 }}
                  transition={SPRING}
                  onClick={() => executeSearch(r)}
                  className="text-xs px-2.5 py-1 rounded-md border border-line bg-raised/60
                    text-t2 hover:border-brand-500/60 hover:text-t1 transition-colors"
                >
                  {r}
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
