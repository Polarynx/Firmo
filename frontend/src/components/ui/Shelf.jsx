import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { paperId } from '../../lib/projects'
import { roleFor, SPRING } from '../../lib/constants'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'

// ── The shelf ───────────────────────────────────────────────────────────────
//
// The sources saved to this paper, stood up as spines.
//
// A list of cards is the right way to *choose* sources and the wrong way to
// *own* them. Once a paper has a dozen, what the student needs is the sense of
// a collection — how much there is, what kind, how far it has come — and that
// is a thing you take in at a glance rather than by scrolling. Books on a shelf
// are the oldest solution to exactly that problem.
//
// Nothing here is invented for effect. Spine width is the paper's citation
// count, so the field's landmarks are physically the widest things on the
// shelf. Colour is the role it plays in the argument. Order is the order they
// were saved, because a shelf is a record of acquisition.
//
// And now you can take one down. A shelf you cannot touch is a picture of a
// shelf: the spines carried a truncated title and a tooltip, which is the least
// a book can tell you. Clicking one pulls it out and turns it face-on, the way
// you would tilt a book to read the cover, and clicking again puts it back.

const MIN_W = 13
const MAX_W = 34

function spineWidth(citations) {
  // Log-compressed: the gap between 10 and 100 citations should read, and so
  // should the gap between 1,000 and 10,000, which a linear scale cannot do.
  const c = Math.max(0, citations || 0)
  const t = Math.min(1, Math.log1p(c) / Math.log1p(5000))
  return Math.round(MIN_W + (MAX_W - MIN_W) * t)
}

export default function Shelf({ sources = [], shape = 'none', onOpen, className = '' }) {
  const [hover, setHover] = useState(null)
  const [pulled, setPulled] = useState(null)
  const toggleSource = useWorkspaceStore(s => s.toggleSource)

  if (sources.length === 0) return null

  const open = pulled && sources.find(p => (paperId(p) || '') === pulled)

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">On the shelf</span>
        <span className="record">{sources.length}</span>
      </div>

      <div
        className="relative"
        style={{ perspective: '900px', perspectiveOrigin: '50% 40%' }}
        onMouseLeave={() => setHover(null)}
      >
        <div className="flex items-end gap-[3px] pt-3 pb-1 overflow-x-auto no-scrollbar">
          {sources.map((p, i) => {
            const id = paperId(p) || String(i)
            const role = p.stance ? roleFor(p.stance, p.shape || shape) : null
            const w = spineWidth(p.citationCount)
            // Height varies a little with the year so the row has a real skyline
            // rather than a ruled top edge. Deterministic, not random: the same
            // book is the same height every time you look at the shelf.
            const h = 96 + ((p.year || 2000) % 7) * 5
            const isUp = hover === id
            const isOut = pulled === id

            return (
              <motion.button
                key={id}
                onMouseEnter={() => setHover(id)}
                onClick={() => setPulled(isOut ? null : id)}
                title={isOut ? 'Put it back' : `${p.title}${p.year ? ` (${p.year})` : ''}`}
                initial={false}
                animate={{
                  // Out and forward, not up. A book leaves a shelf along its own
                  // axis, and lifting it instead is the thing that would make
                  // this read as a web animation rather than as an object.
                  rotateY: isOut ? -52 : isUp ? -22 : -6,
                  z: isOut ? 60 : isUp ? 26 : 0,
                  y: isOut ? -10 : isUp ? -7 : 0,
                  opacity: pulled && !isOut ? 0.45 : 1,
                }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                style={{
                  width: w,
                  height: h,
                  transformOrigin: 'left center',
                  transformStyle: 'preserve-3d',
                }}
                className={`relative shrink-0 rounded-[2px] border overflow-hidden
                  ${role ? role.chip : 'border-hair/15 text-t3'}
                  bg-raised hover:bg-lift transition-colors`}
              >
                {/* The lit edge. One highlight down the leading side, so a row
                    of spines reads as objects catching the lamp rather than as
                    coloured rectangles. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-[2px]"
                  style={{ background: 'rgb(var(--lamp) / 0.22)' }}
                />
                {role && (
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 bottom-0 h-[3px] ${role.dot}`}
                  />
                )}
                <span
                  className="absolute inset-0 flex items-center justify-center px-[3px]
                    font-narrow text-[9px] leading-none text-t2 whitespace-nowrap overflow-hidden"
                  style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                >
                  {(p.title || '').slice(0, 46)}
                </span>
              </motion.button>
            )
          })}
        </div>

        {/* The shelf itself: one rule the books stand on, and its shadow. */}
        <div className="h-px w-full bg-hair/20" />
        <div
          aria-hidden="true"
          className="h-3 w-full"
          style={{ background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.30), transparent)' }}
        />
      </div>

      {/* The book in your hand.
          It arrives by turning rather than fading, from the same edge the spine
          rotates about, so the card reads as the same object seen face-on. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key={pulled}
            initial={{ opacity: 0, rotateY: -38, y: -6 }}
            animate={{ opacity: 1, rotateY: 0, y: 0 }}
            exit={{ opacity: 0, rotateY: 24, transition: { duration: 0.16 } }}
            transition={SPRING}
            style={{ transformOrigin: 'left center' }}
            className="card p-3 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="record">
                {[open.year, open.journal].filter(Boolean).join(' · ') || 'No date'}
              </span>
              {open.stance && (
                <span className={`font-mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5
                  rounded border shrink-0 ${roleFor(open.stance, open.shape || shape).chip}`}>
                  {roleFor(open.stance, open.shape || shape).label}
                </span>
              )}
            </div>

            <p className="font-display text-[13px] leading-snug text-t1">{open.title}</p>
            {Array.isArray(open.authors) && open.authors.length > 0 && (
              <p className="text-[11px] text-t3 leading-snug">
                {open.authors.slice(0, 3).join(', ')}
                {open.authors.length > 3 ? ' et al.' : ''}
              </p>
            )}

            <div className="flex items-center gap-3 pt-0.5">
              {(open.url || open.doi) && (
                <a
                  href={open.url || `https://doi.org/${open.doi}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[11.5px] font-medium text-brand-600 dark:text-signal hover:opacity-75"
                >
                  Open ↗
                </a>
              )}
              <button
                onClick={() => { onOpen?.(open) }}
                className="text-[11.5px] font-medium text-t2 hover:text-t1 transition-colors"
              >
                Details
              </button>
              <button
                onClick={() => { toggleSource(open); setPulled(null) }}
                className="ml-auto text-[11.5px] text-t3 hover:text-red-400 transition-colors"
              >
                Take off the shelf
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
