import { AnimatePresence, motion } from 'framer-motion'

import { useResearchStore } from '../../stores/useResearchStore'
import SiftField from '../ui/SiftField'

// ── The query ledger ────────────────────────────────────────────────────────
//
// What Firmo is doing while a search runs, itemised.
//
// This replaced a progress sweep and a stack of grey skeleton cards, which told
// the student nothing except "wait". That mattered more here than it usually
// does: Firmo's recall is its weakest number, and a search that quietly returns
// the wrong papers is indistinguishable from one that returned the right ones
// slowly. Showing the arms turns the fan-out from something the student has to
// trust into something they can read — and, when a search disappoints, tells
// them *which* phrasing missed, which is the thing they can act on.
//
// It also sets up the honest version of the pitch: these are the queries Firmo
// wrote on your behalf, and this is what each one found.

// Ranking is where the candidates get cut, and enrichment runs after it, so by
// the time PDFs are being looked up the decision has already been made.
const CULLING = new Set(['rank', 'enrich', 'done'])

export default function QueryLedger() {
  const arms = useResearchStore(s => s.arms)
  const statusMsg = useResearchStore(s => s.statusMsg)
  const stage = useResearchStore(s => s.stage)
  const gathered = useResearchStore(s => s.gathered)
  const kept = useResearchStore(s => s.kept)

  if (!arms?.length) return null

  // Not while ranking is still running: nothing has been cut yet, and drawing
  // the cull before the decision exists would be a loading animation dressed up
  // as a result. The counts arrive with the enrich tick, which is when it is true.
  const culling = CULLING.has(stage) && kept > 0

  return (
    <div className="flex flex-col gap-2">
      {/* The field goes above the arms, because the arms explain it: this many
          marks, gathered by these queries, cut to that many. */}
      {gathered > 0 && (
        <div className="flex flex-col gap-1.5 pb-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="eyebrow">
              {culling ? 'Judging every candidate' : 'Gathering candidates'}
            </span>
            <span className="record tabular-nums">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={culling ? 'kept' : 'gathered'}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="inline-block"
                >
                  {culling && kept ? `${kept} of ${gathered} kept` : gathered}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
          <SiftField gathered={gathered} kept={kept} culling={culling} />
        </div>
      )}

      <span className="eyebrow">Queries run</span>

      <ol className="flex flex-col">
        {arms.map((arm, i) => {
          const done = arm.found != null
          return (
            <motion.li
              key={arm.query}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04 }}
              className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-1.5
                border-b border-hair/[0.06]"
            >
              <span className={`font-narrow text-[12.5px] truncate transition-colors ${
                done ? 'text-t1' : 'text-unverified'
              }`}>
                {arm.query}
              </span>
              <span className="record tabular-nums shrink-0">
                {/* An arm that is still out shows a rule, not a zero: zero is a
                    result, and claiming one before it is known is a lie the
                    student would reasonably act on. */}
                {done ? arm.found : '—'}
              </span>
            </motion.li>
          )
        })}
      </ol>

      {statusMsg && <span className="record pt-0.5">{statusMsg}</span>}
    </div>
  )
}
