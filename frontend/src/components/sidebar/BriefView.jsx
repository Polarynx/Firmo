import { motion } from 'framer-motion'

import { useResearchStore } from '../../stores/useResearchStore'
import { SHAPE, SPRING } from '../../lib/constants'
import { EmptyNote } from '../ui/primitives'

// The Question stage. What was asked, what kind of question it turned out to
// be, and what a good answer to that kind of question looks like.
//
// The brief itself stays on the canvas — it is the first thing a student reads
// and it belongs above the page, not beside it. This panel is the standing
// answer to "what am I actually writing about", which is the thing you want to
// re-read on day four when the topic has drifted.

const SHAPE_LABELS = {
  extent: 'A question of degree',
  mechanism: 'A question of mechanism',
  comparison: 'A question of which explanation',
  enumeration: 'A question of coverage',
  interpretive: 'A question of interpretation',
  causal: 'An arguable claim',
}

export default function BriefView() {
  const brief = useResearchStore(s => s.brief)
  const searched = useResearchStore(s => s.searchedQuery)
  const shape = useResearchStore(s => s.questionShape)
  const executeSearch = useResearchStore(s => s.executeSearch)

  if (!brief) {
    return (
      <EmptyNote title="No question yet" graphic>
        Type a topic or a research question into the document and press ⌘↵. Firmo reads what
        kind of question it is before it searches, because that decides what a good answer
        even looks like.
      </EmptyNote>
    )
  }

  const s = SHAPE[shape]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{SHAPE_LABELS[shape] || 'Your question'}</span>
        <p className="font-display text-[15px] leading-snug text-t1">{searched}</p>
      </div>

      {s && (
        <div className="rounded-lg border border-line bg-raised/40 px-3 py-2.5 flex flex-col gap-1">
          <span className="eyebrow">{s.label}</span>
          <p className="text-[11px] text-t2 leading-relaxed">{s.note}</p>
        </div>
      )}

      {Array.isArray(brief.angles) && brief.angles.filter(a => a?.title).length > 0 && (
        <div className="flex flex-col gap-2.5 pt-1">
          <span className="eyebrow">Angles worth taking</span>
          {brief.angles.filter(a => a?.title).map((a, i) => (
            <div key={i} className="border-l border-line pl-3 flex flex-col gap-0.5">
              <p className="text-[12px] font-semibold text-t1">{a.title}</p>
              {a.why && <p className="text-[11px] text-t2 leading-relaxed">{a.why}</p>}
            </div>
          ))}
        </div>
      )}

      {Array.isArray(brief.related) && brief.related.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-line">
          <span className="eyebrow">Ask instead</span>
          {brief.related.map((r, i) => (
            <motion.button
              key={i}
              whileHover={{ x: 3 }}
              transition={SPRING}
              onClick={() => executeSearch(r)}
              className="text-left text-[11.5px] text-t2 hover:text-t1 transition-colors py-0.5"
            >
              {r}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
