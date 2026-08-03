import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { clearSnapshot, readSnapshot, restoreSnapshot } from '../../lib/backup'
import { SPRING } from '../../lib/constants'

// ── "Your work is still here" ───────────────────────────────────────────────
//
// Offered, never applied. Waking up to a paper you did not open is alarming
// even when it turns out to be your own, and a tool that silently restores
// state is a tool nobody can predict.
//
// It only appears when the workspace is genuinely empty and a snapshot has
// something in it, which is the exact shape of the accident this exists for:
// localStorage cleared, IndexedDB survived. If both are gone there is nothing
// to offer and nothing to say, and if the workspace is full the snapshot is
// simply older than what is on screen.

export default function RestoreNote() {
  const projects = useWorkspaceStore(s => s.projects)
  const doc = useWorkspaceStore(s => s.doc)
  const [snap, setSnap] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const empty = projects.length === 0
    || (projects.every(p => (p.sources || []).length === 0) && !doc.trim())

  useEffect(() => {
    if (!empty || done) return
    let cancelled = false
    readSnapshot().then(s => { if (!cancelled && s) setSnap(s) })
    return () => { cancelled = true }
  }, [empty, done])

  if (!snap || !empty || done) return null

  const when = new Date(snap.savedAt)
  const ago = Math.round((Date.now() - snap.savedAt) / 60000)
  const said = ago < 60
    ? `${ago} minute${ago === 1 ? '' : 's'} ago`
    : ago < 60 * 24
      ? `${Math.round(ago / 60)} hour${Math.round(ago / 60) === 1 ? '' : 's'} ago`
      : when.toLocaleDateString()

  async function restore() {
    setBusy(true)
    try {
      await restoreSnapshot(snap)
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  async function dismiss() {
    await clearSnapshot()
    setDone(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="flex items-start gap-3 rounded-lg border border-brand-500/30
        bg-brand-500/[0.06] px-3.5 py-3"
    >
      <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-signal shrink-0" />
      <div className="min-w-0 flex-1 flex flex-col gap-2">
        <p className="text-[12px] text-t1 leading-relaxed">
          Firmo has a copy of <span className="font-medium">{snap.name}</span> from {said}
          {snap.sources > 0 && `, with ${snap.sources} source${snap.sources === 1 ? '' : 's'}`}
          {snap.words > 0 && ` and ${snap.words.toLocaleString()} words`}. This browser lost the
          original, but the backup survived.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={restore}
            disabled={busy}
            className="text-[11.5px] font-medium text-brand-600 dark:text-signal hover:opacity-75 transition-opacity"
          >
            {busy ? 'Putting it back…' : 'Bring it back'}
          </button>
          <span className="text-t3 text-[11px]">·</span>
          <button
            onClick={dismiss}
            className="text-[11.5px] font-medium text-t3 hover:text-t1 transition-colors"
          >
            No thanks, discard it
          </button>
        </div>
      </div>
    </motion.div>
  )
}
