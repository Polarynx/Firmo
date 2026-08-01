import { useState } from 'react'
import { motion } from 'framer-motion'

import { paperId } from '../../lib/projects'
import { roleFor } from '../../lib/constants'

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
// shelf. Colour is the role it plays in the argument, the same cobalt/orange/
// amber/graphite the rest of the workspace uses. Order is the order they were
// saved, because a shelf is a record of acquisition.
//
// The perspective is real rather than a skew: each spine is rotated about its
// own left edge in a shared 3D space, so pulling one forward moves it the way a
// book moves — out of the row, not up the page.

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
  if (sources.length === 0) return null

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
            const id = paperId(p) || i
            const role = p.stance ? roleFor(p.stance, p.shape || shape) : null
            const w = spineWidth(p.citationCount)
            // Height varies a little with the year so the row has a real skyline
            // rather than a ruled top edge. Deterministic, not random: the same
            // book is the same height every time you look at the shelf.
            const h = 96 + ((p.year || 2000) % 7) * 5
            const isUp = hover === id

            return (
              <motion.button
                key={id}
                onMouseEnter={() => setHover(id)}
                onClick={() => onOpen?.(p)}
                title={`${p.title}${p.year ? ` (${p.year})` : ''}${role ? ` — ${role.label}` : ''}`}
                initial={false}
                animate={{
                  rotateY: isUp ? -22 : -6,
                  z: isUp ? 26 : 0,
                  y: isUp ? -7 : 0,
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
                {/* The role band at the foot, the way a call-number label sits
                    at the foot of a library spine. */}
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
    </div>
  )
}
