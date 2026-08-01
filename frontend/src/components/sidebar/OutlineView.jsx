import { useState } from 'react'
import { motion } from 'framer-motion'

import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedSources } from '../../stores/selectors'
import { SPRING, roleFor } from '../../lib/constants'
import { EmptyNote, ErrorNote, SkeletonCard, StatusLine } from '../ui/primitives'
import StageBlocked from './StageBlocked'

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

  // The outline names its sources by title, so that is what the role is looked
  // up by. Cheap enough at saved-source scale to do inline.
  const roleOfTitle = title => {
    const t = (title || '').trim().toLowerCase()
    const hit = t && sources.find(s => (s.title || '').trim().toLowerCase() === t)
    return hit?.stance ? roleFor(hit.stance, hit.shape) : null
  }

  // Refuse out loud, and point at the thing that fixes it. Four is the floor
  // rather than one: an outline planned from two papers is Firmo guessing at a
  // structure, which is worse than no outline because it looks authoritative.
  if (sources.length < 4) {
    const short = 4 - sources.length
    return (
      <StageBlocked
        title={sources.length === 0 ? 'Nothing to plan from yet' : 'A few more sources first'}
        goto="sources"
        action="Open sources"
        reason={sources.length === 0
          ? 'The outline is built from the sources saved to this paper. Search for your topic, bookmark four or five, and Firmo will plan the argument around them.'
          : `You have ${sources.length}. Save ${short} more — an outline built from ${sources.length} paper${sources.length !== 1 ? 's' : ''} is a guess with a structure drawn on it.`}
      />
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
                  {/* Coloured by what the source does, not uniformly cobalt.
                      A point whose only backing is orange is a point argued
                      from the papers that disagree with it, and the student
                      should be able to see that from across the panel. */}
                  {pt.sources.map((s, i) => {
                    const role = roleOfTitle(s.title)
                    return (
                      <span key={i} title={role ? `${s.title} — ${role.label}` : s.title}
                        className={`font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5
                          rounded border ${role ? role.chip : 'border-brand-500/40 text-brand-600 dark:text-signal'}`}>
                        {s.label}
                      </span>
                    )
                  })}
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
