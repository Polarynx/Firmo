import { motion } from 'framer-motion'

import { useResearchStore } from '../../stores/useResearchStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useUIStore } from '../../stores/useUIStore'
import { useSavedSources } from '../../stores/selectors'
import { paperId } from '../../lib/projects'
import { roleFor, ROLE_ORDER, SPRING } from '../../lib/constants'
import { EmptyNote } from '../ui/primitives'
import Shelf from '../ui/Shelf'

// ── The shelf, kept beside the work ─────────────────────────────────────────
//
// What the student has actually decided to keep, on hand no matter which stage
// the centre is showing. This is the panel's steady state and the reason the
// right side of the window is worth its width: the centre changes as the paper
// is made, and the evidence it is being made out of stays put.
//
// It also closes a gap the workspace had. Once Sources moved to the middle, a
// student writing a paragraph had no way to see what they had saved without
// leaving the page they were writing on.

export default function SavedPanel() {
  const sources = useSavedSources()
  const shape = useResearchStore(s => s.questionShape)
  const toggleSource = useWorkspaceStore(s => s.toggleSource)
  const setStage = useUIStore(s => s.setStage)

  if (sources.length === 0) {
    return (
      <EmptyNote
        title="Nothing saved yet"
        action={
          <button onClick={() => setStage('sources')} className="btn-ghost mt-1">
            Open sources
          </button>
        }
      >
        Bookmark the papers you will actually use and they collect here — on hand while you
        outline, while you write, and in the works-cited page at the end.
      </EmptyNote>
    )
  }

  // Grouped by what each source does in the argument, because that is the
  // question being asked of this panel mid-paragraph: not "what have I got" but
  // "have I got anything that cuts the other way".
  const byRole = new Map()
  for (const s of sources) {
    const role = s.stance ? roleFor(s.stance, s.shape || shape) : null
    const key = role?.key || 'other'
    if (!byRole.has(key)) byRole.set(key, { role, items: [] })
    byRole.get(key).items.push(s)
  }
  const groups = [...ROLE_ORDER, 'other']
    .map(k => byRole.get(k) && { key: k, ...byRole.get(k) })
    .filter(Boolean)

  return (
    <div className="flex flex-col gap-4">
      <Shelf
        sources={sources}
        shape={shape}
        onOpen={p => window.open(p.url || (p.doi ? `https://doi.org/${p.doi}` : '#'), '_blank')}
      />

      {groups.map(g => (
        <div key={g.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`eyebrow ${g.role ? '' : '!text-t3'}`}>
              {g.role?.label || 'Unfiled'}
            </span>
            <span className="record">{g.items.length}</span>
          </div>
          {g.items.map(s => (
            <motion.div
              key={paperId(s)}
              layout
              transition={SPRING}
              className="group flex items-start gap-2 text-xs"
            >
              <span className={`mt-[6px] w-1 h-1 rounded-full shrink-0
                ${g.role ? g.role.dot : 'bg-unverified/50'}`} />
              <a
                href={s.url || (s.doi ? `https://doi.org/${s.doi}` : undefined)}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 min-w-0 text-t2 hover:text-brand-500 dark:hover:text-signal
                  leading-snug transition-colors"
              >
                {s.title}
                {s.year ? <span className="text-t3"> ({s.year})</span> : null}
              </a>
              <button
                onClick={() => toggleSource(s)}
                title="Remove from this paper"
                className="opacity-0 group-hover:opacity-100 text-t3 hover:text-red-400
                  transition-all shrink-0 leading-none"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </div>
      ))}
    </div>
  )
}
