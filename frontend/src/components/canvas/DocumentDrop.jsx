import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { API } from '../../lib/api'
import { useUIStore } from '../../stores/useUIStore'
import { importSession } from '../../lib/session'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { SPRING } from '../../lib/constants'

// ── Bringing a paper that already exists ────────────────────────────────────
//
// Firmo could write a .docx and not read one, which is backwards for where
// drafts actually live. Most students arriving here already have three
// paragraphs in Word or Docs, and the cost of trying Firmo was retyping them —
// or pasting and watching every paragraph break collapse.
//
// The hard part is placement, not parsing. The question field is the one way in
// and it earns that by being the only thing on the screen asking for input; a
// second box of equal weight beside it turns one obvious action into a choice,
// which is the exact failure the whole workspace redesign was undoing. So this
// is deliberately quiet: one line under the field, at the weight of a caption,
// that becomes a drop target only while a file is actually over the window.
//
// Google Docs needs no separate path. File → Download → .docx and it arrives
// here, which is one instruction rather than an integration.

export default function DocumentDrop() {
  const setDoc = useWorkspaceStore(s => s.setDoc)
  const setStage = useUIStore(s => s.setStage)
  const inputRef = useRef(null)

  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  // Drag events fire per element, so a naive `onDragLeave` clears the state
  // every time the pointer crosses a child. Counting entries and exits is the
  // standard fix and the only thing that makes a full-window target not flicker.
  const depth = useRef(0)

  async function ingest(file) {
    if (!file) return
    setError('')
    setBusy(true)

    // A .firmo file is a whole session, not a document. Routed here rather than
    // behind a second control because from the student's side both are "a file
    // I have that I want Firmo to open", and making them pick the right slot
    // first is a puzzle with no benefit.
    if (file.name?.toLowerCase().endsWith('.firmo')) {
      try {
        const info = await importSession(file)
        setBusy(false)
        setNote(`Opened "${info.name}" — ${info.sources} source${info.sources === 1 ? '' : 's'}`
          + `${info.words ? `, ${info.words.toLocaleString()} words` : ''}.`)
        return
      } catch (e) {
        setBusy(false)
        setError(e.message || 'Could not open that session.')
        return
      }
    }

    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${API}/api/import-docx`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Firmo could not read that file.')
      if (!data.text?.trim()) throw new Error('That document appears to be empty.')

      setDoc(data.text)
      // Straight to the page it became, not to a confirmation. The student
      // dropped a draft in order to see it in Firmo; making them press "open"
      // afterwards is a step that exists only to prove the upload worked.
      setStage('draft')
    } catch (e) {
      setError(e.message || 'Something went wrong reading that file.')
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    ingest(e.dataTransfer?.files?.[0])
  }

  return (
    <div
      onDragEnter={e => { e.preventDefault(); depth.current += 1; setOver(true) }}
      onDragOver={e => e.preventDefault()}
      onDragLeave={e => {
        e.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) { depth.current = 0; setOver(false) }
      }}
      onDrop={onDrop}
      className="relative"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.firmo,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json"
        className="sr-only"
        onChange={e => { ingest(e.target.files?.[0]); e.target.value = '' }}
      />

      <p className="text-[11.5px] text-t3 leading-relaxed">
        {busy ? (
          <span className="text-t2">Reading your document…</span>
        ) : (
          <>
            Already have something?{' '}
            <button
              data-demo="import-docx"
              onClick={() => inputRef.current?.click()}
              className="font-medium text-t2 hover:text-t1 underline decoration-hair/30
                underline-offset-2 transition-colors"
            >
              Open a Word file or a saved Firmo session
            </button>
            {' '}or drop it here. From Google Docs use File → Download → .docx; a session is
            the .firmo file from another machine.
          </>
        )}
      </p>

      {error && (
        <p className="mt-1.5 text-[11.5px] text-red-500 leading-relaxed">{error}</p>
      )}
      {note && (
        <p className="mt-1.5 text-[11.5px] text-brand-600 dark:text-signal leading-relaxed">
          {note} Everything is where it was.
        </p>
      )}

      {/* The target only exists while something is being carried over it. A
          dashed rectangle sitting on the page permanently is a piece of chrome
          advertising a feature; one that appears under the file in your hand is
          an answer to what you are already doing. */}
      <AnimatePresence>
        {over && (
          <motion.div
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={SPRING}
            className="absolute -inset-x-4 -inset-y-3 z-10 rounded-lg pointer-events-none
              border border-dashed border-brand-500/50 dark:border-signal/50
              bg-brand-500/[0.06] flex items-center justify-center"
          >
            <span className="text-[12px] font-medium text-brand-600 dark:text-signal">
              Drop to open it in Firmo
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
