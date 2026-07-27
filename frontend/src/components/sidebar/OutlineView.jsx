import { useState } from 'react'
import { motion } from 'framer-motion'

import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedSources } from '../../stores/selectors'
import { SPRING } from '../../lib/constants'
import { EmptyNote, ErrorNote, SkeletonCard, StatusLine } from '../ui/primitives'

// View 5: the bridge between "Firmo found forty sources" and "I don't know how
// to start". Every point names the sources that back it; points with no
// evidence carry a ready-made search to go and fill the gap.

export default function OutlineView() {
  const sections = useAnnotationStore(s => s.outline)
  const loading = useAnnotationStore(s => s.outlineLoading)
  const error = useAnnotationStore(s => s.outlineError)
  const build = useAnnotationStore(s => s.buildOutline)

  const sources = useSavedSources()
  const appendToDoc = useWorkspaceStore(s => s.appendToDoc)
  const executeSearch = useResearchStore(s => s.executeSearch)

  const [thesis, setThesis] = useState('')

  if (sources.length === 0) {
    return (
      <EmptyNote title="Save some sources first">
        The outline is built from the sources in your project. Bookmark four or five and Firmo
        will plan the paper around them.
      </EmptyNote>
    )
  }

  // Hand the plan to the document as headings, so the student starts writing
  // into a structure instead of a blank page. Guidance stays in the sidebar;
  // only the section headings cross over, because the prose has to be theirs.
  function sendToDocument() {
    const text = sections.map(s => `${s.title}\n\n`).join('\n')
    appendToDoc(text.trim())
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Outline · from your {sources.length} saved sources</span>
        <textarea
          value={thesis}
          onChange={e => setThesis(e.target.value)}
          rows={2}
          placeholder="Optional: your thesis, so the outline argues it…"
          className="w-full resize-none rounded-md border border-line bg-app/60 px-3 py-2
            text-[12px] leading-relaxed text-t1 placeholder:text-t3 outline-none
            focus:ring-2 focus:ring-brand-500/40 transition-all"
        />
        <button onClick={() => build(sources, thesis)} disabled={loading} className="btn-primary text-xs self-start">
          {loading ? 'Planning…' : sections ? 'Rebuild outline' : 'Build outline'}
        </button>
      </div>

      {error && <ErrorNote onRetry={() => build(sources, thesis)}>{error}</ErrorNote>}

      {loading && (
        <div className="flex flex-col gap-3">
          <StatusLine>Reading your sources and planning the argument…</StatusLine>
          {[0, 1].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {sections && !loading && sections.map((section, si) => (
        <motion.div
          key={si}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: Math.min(si, 6) * 0.04 }}
          className="card p-3.5 flex flex-col gap-2.5"
        >
          <div className="flex items-baseline gap-2">
            <span className="record tabular-nums shrink-0">{String(si + 1).padStart(2, '0')}</span>
            <h3 className="font-display font-semibold text-[13.5px] text-t1 leading-snug">
              {section.title}
            </h3>
          </div>

          {section.points.map((pt, pi) => (
            <div key={pi} className="flex flex-col gap-1.5 pl-2 border-l border-line">
              <p className="text-[12px] text-t1 leading-relaxed">{pt.point}</p>
              {pt.sources?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {pt.sources.map((s, i) => (
                    <span key={i} title={s.title}
                      className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded
                        border border-brand-500/40 text-brand-600 dark:text-signal">
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
              {pt.gap_query && (
                <button
                  onClick={() => executeSearch(pt.gap_query)}
                  className="self-start font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5
                    rounded border border-amber-500/50 text-amber-600 dark:text-amber-400
                    hover:bg-amber-500/10 transition-colors"
                >
                  No source yet · find some
                </button>
              )}
            </div>
          ))}
        </motion.div>
      ))}

      {sections && !loading && (
        <button onClick={sendToDocument} className="btn-ghost w-full py-2.5">
          Send headings to the document
        </button>
      )}
    </div>
  )
}
