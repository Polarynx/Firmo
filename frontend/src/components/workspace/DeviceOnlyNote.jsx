import { useState } from 'react'
import { motion } from 'framer-motion'

import { useAuthStore } from '../../stores/useAuthStore'
import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedSources } from '../../stores/selectors'
import { SPRING } from '../../lib/constants'

// ── Where this paper actually lives ─────────────────────────────────────────
//
// Firmo lets you work without an account, which is the right call — asking for
// an email before a student has seen the tool do anything is how you lose them
// on the first screen. But the consequence was never stated anywhere: an
// unsigned paper exists in one browser profile, on one machine. Clear site data,
// use a locked-down library machine that clears it for you, or simply carry on
// from a different laptop, and it is gone. No warning, no export prompt,
// nothing.
//
// That is the kind of failure that produces one furious message and no second
// chance, and it costs a paragraph to prevent.
//
// Two disciplines keep it from being nagware. It says nothing until there is
// something real to lose — a few hundred words, or a handful of saved sources,
// because warning someone about an empty document is how a notice trains itself
// to be ignored. And dismissing it is remembered, because a student who has
// decided to work anonymously has made a legitimate choice and should not be
// asked to re-make it every session.

const DISMISS_KEY = 'firmo_device_note_dismissed'

// Enough work that losing it would genuinely hurt.
const WORDS_AT_RISK = 150
const SOURCES_AT_RISK = 3

/**
 * Whether there is unsaved work worth warning about, and the note is not
 * already dismissed.
 *
 * Exported so the caller can decide what *else* to show. Only one notice may
 * occupy the top of the centre at a time — two stacked banners is how a
 * workspace starts to read like a site with a cookie policy — and the decision
 * has to be made outside this component, since it is the one that has to
 * disappear for the other to appear.
 */
export function useDeviceAtRisk() {
  const user = useAuthStore(s => s.user)
  const doc = useWorkspaceStore(s => s.doc)
  const sources = useSavedSources()
  const [dismissed] = useState(
    () => { try { return !!localStorage.getItem(DISMISS_KEY) } catch { return false } },
  )
  if (user || dismissed) return false
  const words = doc.trim() ? doc.trim().split(/\s+/).length : 0
  return words >= WORDS_AT_RISK || sources.length >= SOURCES_AT_RISK
}

export default function DeviceOnlyNote({ onQuiet }) {
  const setShowAuth = useUIStore(s => s.setShowAuth)
  const doc = useWorkspaceStore(s => s.doc)
  const sources = useSavedSources()

  const words = doc.trim() ? doc.trim().split(/\s+/).length : 0

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    onQuiet?.()
  }

  const has = [
    words ? `${words.toLocaleString()} word${words === 1 ? '' : 's'}` : null,
    sources.length ? `${sources.length} source${sources.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' and ')

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="flex items-start gap-3 rounded-lg border border-amber-500/25
        bg-amber-500/[0.05] px-3.5 py-3"
    >
      <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
      <div className="min-w-0 flex-1 flex flex-col gap-2">
        <p className="text-[12px] text-t1 leading-relaxed">
          This paper lives in this browser only. You have {has} here, and clearing your
          site data — or opening Firmo on another machine — would lose it.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowAuth(true)}
            className="text-[11.5px] font-medium text-brand-600 dark:text-signal hover:opacity-75 transition-opacity"
          >
            Save it to an account
          </button>
          {/* The second exit matters as much as the first. Someone who does not
              want an account still deserves a way to not lose their work, and
              offering only the signup is how a safety notice reads as a growth
              tactic. */}
          <span className="text-t3 text-[11px]">or</span>
          <button
            onClick={() => useUIStore.getState().setStage('export')}
            className="text-[11.5px] font-medium text-t2 hover:text-t1 transition-colors"
          >
            Download a copy now
          </button>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-t3 hover:text-t1 transition-colors text-[13px] leading-none px-1"
      >
        ×
      </button>
    </motion.div>
  )
}
