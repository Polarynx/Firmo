import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { postJSON } from '../../lib/api'
import { SPRING } from '../../lib/constants'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { EdgeProgress, Keycap } from '../ui/primitives'

// Bringing an existing library in.
//
// A student arriving with forty sources already in Zotero should not have to
// start from an empty project — that is the fastest way to lose them back to
// whatever they were using before. Three ways in, all through one box: drop a
// file, paste an export, or paste DOIs.

const FORMAT_LABEL = {
  ris: 'RIS',
  bibtex: 'BibTeX',
  doi: 'DOIs',
}

export default function ImportSheet({ open, onClose }) {
  const addSources = useWorkspaceStore(s => s.addSources)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  function reset() {
    setText('')
    setError('')
    setResult(null)
  }

  async function readFile(file) {
    if (!file) return
    setError('')
    try {
      setText(await file.text())
    } catch {
      setError(`Couldn't read ${file.name}.`)
    }
  }

  async function run() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const data = await postJSON('/api/import', { text: body, format: 'auto' })
      const { added, skipped } = addSources(data.papers || [])
      setResult({
        format: data.format,
        found: data.count,
        added,
        // Duplicates inside the file and duplicates against the project are
        // the same thing to the student: sources that were already covered.
        skipped: skipped + (data.duplicates || 0),
        unresolved: data.unresolved || [],
      })
      setText('')
    } catch (e) {
      setError(e.message || 'That import failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/55 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={SPRING}
        role="dialog"
        aria-label="Import sources"
        className="glass relative w-full max-w-lg p-5 flex flex-col gap-4"
      >
        <EdgeProgress active={busy} />

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display font-semibold text-[17px] text-t1">Import sources</h2>
            <p className="text-[11.5px] text-t2 leading-relaxed max-w-[46ch]">
              Drop a RIS or BibTeX export from Zotero, Mendeley, or EndNote — or paste
              DOIs, one per line. Firmo fills in whatever the file left out.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost shrink-0">Close</button>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setDragging(false)
            readFile(e.dataTransfer.files?.[0])
          }}
          className={`relative rounded-xl border transition-colors ${
            dragging ? 'border-brand-500/60 bg-brand-500/[0.06]' : 'border-hair/10 bg-hair/[0.02]'
          }`}
        >
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setResult(null); setError('') }}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run() }
            }}
            spellCheck={false}
            placeholder={'TY  - JOUR\nAU  - …\n\nor\n\n10.1037/a0024526'}
            className="w-full h-44 resize-none bg-transparent outline-none p-3.5
              font-mono text-[11.5px] leading-relaxed text-t1 placeholder:text-t3/70"
          />
          {dragging && (
            <div className="absolute inset-0 grid place-items-center rounded-xl
              text-[12px] font-medium text-brand-600 dark:text-signal pointer-events-none">
              Drop to read the file
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".ris,.bib,.bibtex,.txt,.nbib"
              className="hidden"
              onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }}
            />
            <button onClick={() => fileRef.current?.click()} className="btn-ghost">
              Choose a file
            </button>
            {text && <button onClick={reset} className="btn-ghost">Clear</button>}
          </div>
          <button onClick={run} disabled={!text.trim() || busy}
            className="btn-primary text-xs py-1.5 flex items-center gap-2">
            {busy ? 'Reading…' : 'Import'}
            {!busy && text.trim() && (
              <span className="flex items-center gap-1">
                <Keycap>⌘</Keycap><Keycap>↵</Keycap>
              </span>
            )}
          </button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              key="import-error"
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3.5 py-2.5
                text-[11.5px] text-red-600 dark:text-red-300 leading-relaxed"
            >
              {error}
            </motion.p>
          )}

          {result && (
            <motion.div
              key="import-result"
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={SPRING}
              className="rounded-xl border border-hair/10 bg-hair/[0.03] px-3.5 py-3 flex flex-col gap-1.5"
            >
              <p className="text-[12px] text-t1">
                <span className="font-medium">{result.added} added</span>
                {result.skipped > 0 && (
                  <span className="text-t2"> · {result.skipped} already in this paper</span>
                )}
                {result.format && (
                  <span className="text-t3"> · read as {FORMAT_LABEL[result.format] || result.format}</span>
                )}
              </p>
              {result.added === 0 && result.skipped > 0 && (
                <p className="text-[11px] text-t2">
                  Everything in that file was already saved here.
                </p>
              )}
              {result.unresolved.length > 0 && (
                <p className="text-[11px] text-t2 leading-relaxed">
                  {result.unresolved.length} DOI{result.unresolved.length === 1 ? '' : 's'} didn't
                  resolve — check for a typo:{' '}
                  <span className="font-mono text-[10.5px] text-t3">
                    {result.unresolved.slice(0, 3).join(', ')}
                    {result.unresolved.length > 3 ? '…' : ''}
                  </span>
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
