import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedSources } from '../../stores/selectors'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { postJSON } from '../../lib/api'
import { paperId } from '../../lib/projects'
import { CITATION_STYLES, SPRING } from '../../lib/constants'
import { renderMarkup, stripMarkup } from '../../lib/richText'
import { SkeletonLines } from '../ui/primitives'

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// The works-cited page, anchored to the foot of the document and rebuilt every
// time a source is saved or the style changes. It is the one artefact every
// assignment demands, so it is never more than a scroll away from the prose.

export default function BibliographyBlock() {
  const sources = useSavedSources()
  const style = useWorkspaceStore(s => s.citationStyle)
  const styleLabel = CITATION_STYLES.find(s => s.key === style)?.label || style.toUpperCase()
  const entries = useWorkspaceStore(s => s.bibEntries)
  const loading = useWorkspaceStore(s => s.bibLoading)
  const buildOutline = useAnnotationStore(s => s.buildOutline)

  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState(false)
  const [annotations, setAnnotations] = useState(null)
  const [annotating, setAnnotating] = useState(false)
  const [annError, setAnnError] = useState('')

  if (sources.length === 0) return null

  function copyAll() {
    const text = entries.map(e => stripMarkup(e.citation)).join('\n\n')
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleDownload(format) {
    setMenu(false)
    if (format === 'text') {
      if (entries.length === 0) return
      download('works-cited.txt', entries.map(e => stripMarkup(e.citation)).join('\n\n'))
      return
    }
    try {
      const data = await postJSON('/api/export', { papers: sources, style, format })
      download(data.filename, data.content)
    } catch {}
  }

  async function annotate() {
    if (annotating) return
    if (annotations) { setAnnotations(null); return }
    setAnnotating(true)
    setAnnError('')
    try {
      const data = await postJSON('/api/annotated-bib', { papers: sources, style })
      setAnnotations(data.entries || [])
    } catch {
      setAnnError("Couldn't write the annotations just now.")
    } finally {
      setAnnotating(false)
    }
  }

  const annotationFor = id => annotations?.find(a => a.id === id)?.annotation

  return (
    <motion.section
      layout
      transition={SPRING}
      className="flex flex-col gap-3 pt-8 mt-2 border-t border-line"
    >
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow">Works cited · builds itself</span>
          <h2 className="font-display font-semibold text-lg text-t1">
            {sources.length} source{sources.length === 1 ? '' : 's'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* The style itself is switched from the top bar, since it governs
              every citation Firmo writes, not just this block. */}
          <span className="record">{styleLabel}</span>

          <div className="relative">
            <button onClick={() => setMenu(m => !m)} className="btn-ghost">Export ▾</button>
            <AnimatePresence>
              {menu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={SPRING}
                  className="absolute right-0 top-9 z-30 glass p-1 flex flex-col min-w-[168px]"
                >
                  <button onClick={() => handleDownload('text')} className="text-left text-xs px-2.5 py-1.5 rounded text-t2 hover:bg-raised hover:text-t1">Text (.txt)</button>
                  <button onClick={() => handleDownload('bibtex')} className="text-left text-xs px-2.5 py-1.5 rounded text-t2 hover:bg-raised hover:text-t1">BibTeX (.bib)</button>
                  <button onClick={() => handleDownload('ris')} className="text-left text-xs px-2.5 py-1.5 rounded text-t2 hover:bg-raised hover:text-t1">RIS for Zotero (.ris)</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* The works-cited page keeps a faint surface of its own: it is the one
          thing here that really is a separate page from the draft. */}
      <div className="rounded-lg border border-line bg-panel/60 px-6 py-5 flex flex-col gap-3">
        {loading ? (
          <SkeletonLines lines={4} />
        ) : entries.length > 0 ? (
          entries.map(e => (
            <div key={e.id} className="flex flex-col gap-1">
              <p className="bib-entry">{renderMarkup(e.citation)}</p>
              {annotationFor(e.id) && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={SPRING}
                  className="text-[13px] text-t2 leading-relaxed pl-[1.4em] pr-2"
                >
                  {annotationFor(e.id)}
                </motion.p>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-t3">Citations will appear here.</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={copyAll} disabled={loading || entries.length === 0} className="btn-primary text-xs">
          {copied
            ? '✓ Copied, paste into your paper'
            : `Copy ${entries.length === 1 ? 'the citation' : `all ${entries.length} citations`}`}
        </button>
        <button onClick={annotate} disabled={annotating} className="btn-ghost">
          {annotating ? 'Writing annotations…' : annotations ? 'Hide annotations' : 'Annotate'}
        </button>
        <button onClick={() => buildOutline(sources)} className="btn-ghost">
          Outline from these
        </button>
      </div>

      {annError && <p className="text-[11px] text-red-500">{annError}</p>}

      {annotations && (
        <p className="text-[10px] text-t3">
          Annotations summarise each source and how it serves your paper. Check them against the
          abstract before handing them in.
        </p>
      )}

      {/* Quiet index of what is saved, with a way to drop a source. */}
      <details className="group">
        <summary className="eyebrow cursor-pointer list-none select-none hover:text-t2 transition-colors">
          Manage sources ▸
        </summary>
        <div className="flex flex-col gap-1.5 pt-3">
          {sources.map(s => (
            <div key={paperId(s)} className="group/row flex items-start gap-2 text-xs">
              <span className="text-t3 mt-0.5 shrink-0">·</span>
              <a
                href={s.url || (s.doi ? `https://doi.org/${s.doi}` : undefined)}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 text-t2 hover:text-brand-500 dark:hover:text-signal leading-snug transition-colors"
              >
                {s.title}{s.year ? ` (${s.year})` : ''}
              </a>
              <button
                onClick={() => useWorkspaceStore.getState().toggleSource(s)}
                className="opacity-0 group-hover/row:opacity-100 text-t3 hover:text-red-400 transition-all shrink-0"
                title="Remove from project"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </details>
    </motion.section>
  )
}
