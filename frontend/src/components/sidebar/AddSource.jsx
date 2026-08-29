import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { API, postJSON } from '../../lib/api'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedIds, useSavedSources } from '../../stores/selectors'
import { paperId } from '../../lib/projects'
import { SPRING } from '../../lib/constants'
import SourceCard from './SourceCard'

// ── Sources you brought yourself ────────────────────────────────────────────
//
// Firmo could only hold papers it had found, which is a strange limit for a
// research tool. The reading list came from a lecturer. The key paper was named
// in a seminar. The useful one turned up in somebody else's bibliography. All of
// those arrive as a DOI, a link, a title or a PDF, and the only thing a student
// could do with them was search the topic again and hope the right paper came
// back.
//
// They live in their own section rather than mixed into the results, because
// where a source came from changes how much you trust it and how you talk about
// it. A paper Firmo ranked into your top ten is a different kind of object from
// one your professor emailed you, even when they are the same paper.
//
// An identifier is resolved rather than accepted as typed. A record with a real
// DOI can be cited properly, checked against the publisher later, and matched to
// your reference list; a hand-typed title cannot do any of those.

export default function AddSource({ query = '', shape = 'none' }) {
  const addSources = useWorkspaceStore(s => s.addSources)
  const savedIds = useSavedIds()
  // Through the shared hook, never `s.activeProject()?.sources || []`. That
  // builds a new array on every render, zustand compares selector results by
  // identity, and the component re-renders until React gives up with "Maximum
  // update depth exceeded" — a blank screen, not an error anyone can read. It
  // fired the moment Sources was opened with nothing in it, because this
  // section is the one thing that surface always draws.
  const sources = useSavedSources()

  // Folded by default. Adding a source you already have is a real thing people
  // do and a rare one next to reading the results, and an input box plus two
  // lines of help sitting permanently above sixty papers pushed the papers off
  // the screen. It opens on a press, and stays open once there is something in
  // it to show.
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const fileRef = useRef(null)
  const depth = useRef(0)

  const mine = sources.filter(p => p.addedByHand || p.imported)

  async function lookup() {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    setError('')
    try {
      const { paper } = await postJSON('/api/add-source', { value: v })
      const res = addSources([paper], 'Added by you')
      if (res?.added === 0) setError('That one is already on your shelf.')
      else setValue('')
    } catch (e) {
      setError(e.message || 'Could not find that.')
    } finally {
      setBusy(false)
    }
  }

  async function readFile(file) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${API}/api/import-docx`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Could not read that file.')
      const added = addSources([data.paper], 'Your file')
      if (added?.added === 0) setError('That file is already on your shelf.')
    } catch (e) {
      setError(e.message || 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      onDragEnter={e => { e.preventDefault(); depth.current += 1; setOver(true) }}
      onDragOver={e => e.preventDefault()}
      onDragLeave={e => {
        e.preventDefault()
        depth.current -= 1
        if (depth.current <= 0) { depth.current = 0; setOver(false) }
      }}
      onDrop={e => {
        e.preventDefault(); depth.current = 0; setOver(false)
        readFile(e.dataTransfer?.files?.[0])
      }}
      className="relative flex flex-col gap-3"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-baseline justify-between gap-2 text-left group"
      >
        <span className="eyebrow group-hover:!text-t2 transition-colors">
          {mine.length ? 'Added by you' : 'Add a source you already have'}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {mine.length > 0 && <span className="record">{mine.length}</span>}
          <span className={`text-t3 text-[9px] transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        </span>
      </button>

      {open && (
        <div className="flex items-center gap-2">
        <input
          data-demo="add-source"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup() } }}
          placeholder="Paste a DOI, a link, or the title of a paper…"
          className="flex-1 min-w-0 rounded-md border border-line bg-app/60 px-3 py-2
            text-[12px] text-t1 placeholder:text-t3 outline-none
            focus:ring-2 focus:ring-brand-500/35 transition-all"
        />
        <button onClick={lookup} disabled={busy || !value.trim()} className="btn-primary text-xs py-1.5 shrink-0">
          {busy ? 'Looking…' : 'Add'}
        </button>
        </div>
      )}

      {open && (
      <p className="text-[11px] text-t3 leading-relaxed">
        Firmo looks it up properly, so it can be cited and checked like anything else.
        Got the file instead?{' '}
        <button
          onClick={() => fileRef.current?.click()}
          className="font-medium text-t2 hover:text-t1 underline decoration-hair/30 underline-offset-2"
        >
          Read a document
        </button>
        {' '}or drop it here.
      </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }}
      />

      {error && <p className="text-[11.5px] text-red-500 leading-relaxed">{error}</p>}

      {mine.length > 0 && (
        <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
          {mine.map((p, i) => (
            <SourceCard
              key={paperId(p) || i}
              paper={p}
              index={i}
              query={query}
              shape={shape}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {over && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={SPRING}
            className="absolute -inset-3 z-10 rounded-lg pointer-events-none
              border border-dashed border-brand-500/50 bg-brand-500/[0.06]
              flex items-center justify-center"
          >
            <span className="text-[12px] font-medium text-brand-600 dark:text-signal">
              Drop to add it as a source
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-px bg-hair/10" />
    </section>
  )
}
