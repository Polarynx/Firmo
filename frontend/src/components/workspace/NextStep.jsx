import { motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { SPRING } from '../../lib/constants'

// ── Where to go next, offered rather than taken ─────────────────────────────
//
// Firmo used to move you. Running a search jumped straight to Sources, checking
// a draft jumped to Claims, building an outline jumped to Outline. Each of those
// is the right guess about what you want next and the wrong way to act on it:
// the screen changes under someone who was still reading, and the lesson learned
// is that pressing things here teleports you somewhere without asking.
//
// So the guess is still made, and offered. One clear button at the foot of the
// surface, naming the next room and why you would go there. Nothing moves until
// it is pressed.
//
// It is deliberately large. The old version of this was a small text link that
// said "See what came back →" under a research brief, and it was routinely
// missed — which is how you end up with someone who has run a search and does
// not know sixty papers are waiting one tab away.

export default function NextStep({ to, label, hint, tone = 'primary' }) {
  const setStage = useUIStore(s => s.setStage)
  if (!to) return null

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      onClick={() => setStage(to)}
      data-demo={`next-${to}`}
      className={`group w-full flex items-center justify-between gap-4 rounded-lg px-5 py-4
        text-left transition-colors ${
          tone === 'primary'
            ? 'border border-brand-500/40 bg-brand-500/[0.07] hover:bg-brand-500/[0.12]'
            : 'border border-hair/12 bg-hair/[0.03] hover:bg-hair/[0.06]'
        }`}
    >
      <span className="min-w-0 flex flex-col gap-1">
        <span className={`text-[14.5px] font-medium ${
          tone === 'primary' ? 'text-brand-600 dark:text-signal' : 'text-t1'
        }`}>
          {label}
        </span>
        {hint && <span className="text-[12px] text-t2 leading-relaxed">{hint}</span>}
      </span>
      <span className={`shrink-0 text-lg leading-none transition-transform group-hover:translate-x-1
        ${tone === 'primary' ? 'text-brand-500 dark:text-signal' : 'text-t3'}`}>
        →
      </span>
    </motion.button>
  )
}
