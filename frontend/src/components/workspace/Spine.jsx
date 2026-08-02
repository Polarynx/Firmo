import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'

import { useRecordStore } from '../../stores/useRecordStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useUIStore } from '../../stores/useUIStore'

// ── The spine ───────────────────────────────────────────────────────────────
//
// A ledger rail down the left edge of the document: one tick per thing that
// happened while this paper was written, oldest at the top, accreting as the
// student works.
//
// It used to carry the stage navigation on top of the ticks, which made one
// 52px column answer two unrelated questions — where am I in the paper, and what
// have I done to it — in the same glance, with the navigation half set in 8.5px
// type rotated on its side. The stages are tabs above the centre now. This rail
// does one thing: the record.
//
// It is here because it is the product's argument made visible. Firmo's claim
// is that it can show *how* a paper was made; a claim like that cannot live
// behind a menu item, or nobody will believe it is real. Watching the rail fill
// while you work is the whole pitch, delivered without a word of copy.
//
// The refusal tick is the one that matters most. Firmo declines to write prose,
// and every competitor's entire product is writing prose — so a visible, dated
// mark saying "asked for an intro, refused" is the single hardest thing for
// anyone else in this category to show.

// Ticks are read at a glance down a 34px rail, so each kind gets a shape and a
// weight, not just a colour: colour alone would be unreadable at this size and
// invisible to a colour-blind reader.
const TICK = {
  'search.run':      { w: 18, tone: 'bg-unverified',        label: 'Search run' },
  'search.expand':   { w: 12, tone: 'bg-unverified/70',     label: 'Citations followed' },
  'source.open':     { w: 8,  tone: 'bg-unverified/60',     label: 'Source opened' },
  'source.save':     { w: 22, tone: 'bg-brand-500 dark:bg-signal', label: 'Source saved' },
  'source.remove':   { w: 8,  tone: 'bg-unverified/50',     label: 'Source removed' },
  'import.run':      { w: 18, tone: 'bg-brand-500/70 dark:bg-signal/70', label: 'References imported' },
  'draft.snapshot':  { w: 6,  tone: 'bg-unverified/40',     label: 'Draft saved' },
  'draft.check':     { w: 18, tone: 'bg-unverified',        label: 'Draft checked' },
  'claim.flagged':   { w: 14, tone: 'bg-annot-amber',       label: 'Claim needs a source' },
  'claim.resolved':  { w: 22, tone: 'bg-brand-500 dark:bg-signal', label: 'Claim backed' },
  'citation.insert': { w: 22, tone: 'bg-brand-500 dark:bg-signal', label: 'Citation inserted' },
  'citations.audit': { w: 18, tone: 'bg-unverified',        label: 'References audited' },
  'chat.turn':       { w: 10, tone: 'bg-unverified/70',     label: 'Asked Firmo' },
  'chat.refusal':    { w: 26, tone: 'bg-annot-red/80',      label: 'Firmo refused to write' },
  'export.docx':     { w: 18, tone: 'bg-unverified',        label: 'Exported' },
}

const FALLBACK = { w: 8, tone: 'bg-unverified/50', label: 'Recorded' }

function clockOf(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Spine() {
  const activeProjectId = useWorkspaceStore(s => s.activeProjectId)
  const events = useRecordStore(s => s.events)
  const setShowRecord = useUIStore(s => s.setShowRecord)
  const [hovered, setHovered] = useState(null)

  const mine = useMemo(
    () => events.filter(e => e.projectId === activeProjectId),
    [events, activeProjectId],
  )

  // The rail shows the tail. A paper with four hundred events cannot show them
  // all at 34px wide, and the recent ones are the ones being reasoned about;
  // the full record lives behind the counter at the foot.
  const shown = mine.slice(-120)
  const refusals = mine.filter(e => e.kind === 'chat.refusal').length

  return (
    <div
      className="hidden md:flex shrink-0 w-[52px] flex-col items-center
        border-r border-hair/[0.07] bg-panel/30 select-none"
      onMouseLeave={() => setHovered(null)}
    >
      <div className="w-full pt-3 flex flex-col items-center">
        <span
          className="record mb-1.5 tracking-[0.2em]"
          style={{ writingMode: 'vertical-rl' }}
        >
          RECORD
        </span>
      </div>

      <div className="flex-1 min-h-0 w-full overflow-y-auto no-scrollbar
        flex flex-col items-center gap-[3px] py-1">
        {shown.length === 0 && (
          // Not an empty state with a message — there is no room for one. A
          // single faint tick reads as a rail waiting to be written on.
          <span className="mt-2 h-px w-3 bg-hair/15" aria-hidden="true" />
        )}

        {shown.map((ev, i) => {
          const t = TICK[ev.kind] || FALLBACK
          return (
            <motion.span
              key={`${ev.at}-${i}`}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={e => setHovered({
                ...ev, ...t,
                // Measured from the tick, because a label positioned from the
                // rail alone would sit at the top of the column instead of
                // beside the mark it describes.
                top: e.currentTarget.getBoundingClientRect().top,
              })}
              className={`h-[2px] rounded-record origin-center cursor-default ${t.tone}`}
              style={{ width: t.w }}
            />
          )
        })}
      </div>

      {/* The counter is the way into the full record. Refusals are called out
          separately because they are the part an instructor cares about. */}
      <button
        data-demo="open-record"
        onClick={() => setShowRecord(true)}
        title="Open the full process record"
        className="w-full py-2 border-t border-hair/[0.07] flex flex-col items-center gap-0.5
          text-unverified hover:text-t1 transition-colors"
      >
        <span className="font-mono text-[10px] tabular-nums">{mine.length}</span>
        {refusals > 0 && (
          <span className="font-mono text-[8px] tabular-nums text-annot-red/90"
            title={`${refusals} refusal${refusals === 1 ? '' : 's'} recorded`}>
            {refusals}✕
          </span>
        )}
      </button>

      {/* Anchored to the viewport rather than nested in the rail: a 34px column
          cannot contain a readable label, and clipping it to the rail would
          hide the thing the hover exists to show. */}
      {hovered && (
        <div className="fixed left-[42px] z-50 pointer-events-none glass px-2.5 py-1.5
          flex flex-col gap-0.5"
          style={{ top: Math.max(8, hovered.top - 14) }}
        >
          <span className="text-[11px] text-t1 leading-none">{hovered.label}</span>
          <span className="record leading-none">{clockOf(hovered.at)}</span>
        </div>
      )}
    </div>
  )
}
