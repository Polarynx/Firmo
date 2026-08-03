import { useMemo } from 'react'
import { motion } from 'framer-motion'

import { useRecordStore } from '../../stores/useRecordStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useUIStore } from '../../stores/useUIStore'
import { SPRING } from '../../lib/constants'

// ── What you have actually done ─────────────────────────────────────────────
//
// Firmo's claim is that it can show how a paper was made. That claim was being
// asserted in marketing copy and stored in a 52px rail of coloured dashes that
// almost nobody clicks, which means the single thing separating Firmo from
// every other research assistant was invisible to the people using it.
//
// This is the same data, said in a sentence. Not a dashboard and not a
// gamified progress bar: four counts and a link, at the foot of the panel that
// already answers "where does this paper stand".
//
// It appears only once there is something to be proud of. A receipt that reads
// "0 searches, 0 sources" on an empty project is a scoreboard telling a student
// they have done nothing, which is the opposite of the intended effect.

const COUNTS = [
  { key: 'searches', label: 'search', plural: 'searches', kinds: ['search.run'] },
  { key: 'sources', label: 'source saved', plural: 'sources saved', kinds: ['source.save'] },
  { key: 'backed', label: 'claim backed', plural: 'claims backed',
    kinds: ['citation.insert', 'claim.resolved'] },
  { key: 'checks', label: 'draft check', plural: 'draft checks', kinds: ['draft.check'] },
]

export default function RecordReceipt() {
  const events = useRecordStore(s => s.events)
  const activeProjectId = useWorkspaceStore(s => s.activeProjectId)
  const setShowRecord = useUIStore(s => s.setShowRecord)

  const { totals, refusals, total } = useMemo(() => {
    const mine = events.filter(e => e.projectId === activeProjectId)
    const t = {}
    for (const c of COUNTS) t[c.key] = mine.filter(e => c.kinds.includes(e.kind)).length
    return {
      totals: t,
      refusals: mine.filter(e => e.kind === 'chat.refusal').length,
      total: mine.length,
    }
  }, [events, activeProjectId])

  // Two events is a page load and a stray click. Four is a session.
  if (total < 4) return null

  const said = COUNTS
    .filter(c => totals[c.key] > 0)
    .map(c => `${totals[c.key]} ${totals[c.key] === 1 ? c.label : c.plural}`)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="flex flex-col gap-2 rounded-lg border border-hair/10 bg-hair/[0.03] px-3.5 py-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Your working record</span>
        <span className="record tabular-nums">{total}</span>
      </div>

      <p className="text-[12px] text-t2 leading-relaxed">
        {said.slice(0, -1).join(', ')}
        {said.length > 1 ? ' and ' : ''}
        {said[said.length - 1]}. All of it timestamped and hash-chained, so it can be
        checked without anyone reading your draft.
      </p>

      {/* The refusals are the part an instructor cares about, and the part no
          competitor can show, so they are stated rather than counted quietly
          among the rest. */}
      {refusals > 0 && (
        <p className="text-[11.5px] text-t2 leading-relaxed">
          <span className="text-brand-600 dark:text-signal font-medium">
            {refusals} time{refusals === 1 ? '' : 's'}
          </span>{' '}
          you asked Firmo to write something and it handed the work back. That is in there too.
        </p>
      )}

      <button
        data-demo="see-record"
        onClick={() => setShowRecord(true)}
        className="self-start text-[11.5px] font-medium text-brand-600 dark:text-signal
          hover:opacity-75 transition-opacity"
      >
        See the whole record →
      </button>
    </motion.div>
  )
}
