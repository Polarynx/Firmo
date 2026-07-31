import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'

// ── The sift ────────────────────────────────────────────────────────────────
//
// The most impressive true thing Firmo does is throw work away. A search
// gathers a few hundred candidates and hands back sixty, and the discipline of
// that cut is the entire reason the sixty are worth reading. Until now the
// student saw it as a sentence — "Ranking 273 papers for relevance…" — which is
// the one presentation guaranteed not to land, because every tool in this
// category claims to be thorough and none of them show it.
//
// So the candidates are drawn. One hairline per paper, inked in as the
// databases answer, and then a cull that sweeps left to right and leaves the
// keepers standing. Nothing here is decorative: the number of marks is the
// number of papers, and the number left standing is the number returned. If the
// search found little, the field is visibly sparse, which is information the
// student should have rather than a spinner that looks identical either way.
//
// The sweep runs in reading direction, matching the claim-layer wash on the
// hero, so the two places where Firmo is visibly judging something move alike.

const COLS = 44
const ROWS = 3
const SLOTS = COLS * ROWS
const TICK_H = 9

// Slots are filled in a scattered order rather than left to right, so a
// half-finished search reads as a field filling in, not as a progress bar with
// extra steps. Deterministic, so a re-render never reshuffles the marks.
function slotOrder() {
  const out = []
  for (let i = 0; i < SLOTS; i++) out.push(i)
  let seed = 0x9e3779b9
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export default function SiftField({ gathered = 0, kept = 0, culling = false, className = '' }) {
  const reduced = useReducedMotion()
  const order = useMemo(slotOrder, [])

  // The field is capped, so past a few hundred candidates one mark stands for
  // several. The ratio is what carries the meaning, and it survives the scaling.
  const inked = Math.min(SLOTS, gathered)
  const survivors = gathered > 0
    ? Math.round(Math.min(SLOTS, gathered) * Math.min(1, kept / gathered))
    : 0

  // Which marks survive is decided by the same shuffle that fills them, so the
  // keepers are scattered through the field instead of clustering at one end.
  const keepSet = useMemo(
    () => new Set(order.slice(0, survivors)),
    [order, survivors],
  )

  const marks = []
  for (let n = 0; n < inked; n++) {
    const slot = order[n]
    const col = slot % COLS
    const row = Math.floor(slot / COLS)
    marks.push({ slot, n, col, row, keep: culling && keepSet.has(slot) })
  }

  return (
    <div className={`w-full ${className}`} aria-hidden="true">
      <svg
        viewBox={`0 0 ${COLS * 4} ${ROWS * (TICK_H + 4)}`}
        preserveAspectRatio="none"
        className="w-full h-[44px] overflow-visible"
      >
        {marks.map(({ slot, n, col, row, keep }) => (
          <motion.rect
            key={slot}
            x={col * 4 + 1}
            y={row * (TICK_H + 4) + 2}
            width={1.2}
            height={TICK_H}
            rx={0.6}
            className={keep
              ? 'fill-brand-500 dark:fill-signal'
              : 'fill-[rgb(var(--c-t3))]'}
            initial={reduced ? false : { opacity: 0, scaleY: 0.2 }}
            animate={{
              // Culled marks are not removed. A rejected candidate is still a
              // paper Firmo looked at, and the record says so; leaving a ghost
              // is the honest picture of a search that considered 273 things.
              opacity: culling ? (keep ? 1 : 0.16) : 0.55,
              scaleY: culling ? (keep ? 1 : 0.45) : 0.8,
            }}
            style={{ originY: 1, originX: 0.5 }}
            transition={reduced ? { duration: 0 } : {
              // Arrival is quick and staggered by how recently the paper landed.
              // The cull is staggered by COLUMN, which is what turns a hundred
              // independent fades into one wave crossing the field.
              delay: culling ? col * 0.008 : Math.min(n, 60) * 0.006,
              type: 'spring',
              stiffness: culling ? 420 : 600,
              damping: culling ? 34 : 26,
            }}
          />
        ))}
      </svg>
    </div>
  )
}
