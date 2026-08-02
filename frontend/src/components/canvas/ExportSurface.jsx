import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedSources } from '../../stores/selectors'
import { useUIStore } from '../../stores/useUIStore'
import { readStages } from '../../lib/stages'

import SurfaceShell from './SurfaceShell'
import BibliographyBlock from './BibliographyBlock'

// ── Stage 7: out of Firmo ───────────────────────────────────────────────────
//
// The last screen before hand-in, and the only one whose job is to say *don't*
// as often as it says here you go. A student arrives here to download a file;
// what they need first is to be told, plainly, that eleven of their claims are
// still unbacked and two of their references could not be found. The download
// still works — refusing to hand over their own writing would be absurd — but
// the state of the paper is stated above it rather than after the fact.

export default function ExportSurface() {
  const doc = useWorkspaceStore(s => s.doc)
  const sources = useSavedSources()
  const setStage = useUIStore(s => s.setStage)
  const stages = readStages()

  const words = doc.trim() ? doc.trim().split(/\s+/).length : 0

  // Only the two that mean something is actually wrong. "You have not built an
  // outline" is not a reason to hold up a finished paper.
  const warnings = [
    stages.claims.state === 'part' && {
      key: 'claims',
      text: stages.claims.note,
      action: 'Open claims',
    },
    stages.references.state === 'part' && {
      key: 'references',
      text: stages.references.note,
      action: 'Open references',
    },
  ].filter(Boolean)

  if (!doc.trim() && sources.length === 0) {
    return (
      <SurfaceShell eyebrow="Export" title="Nothing to hand in yet">
        <p className="text-[13px] text-t2 leading-relaxed max-w-[52ch]">
          Once there is a draft on the page or a source saved to this paper, Firmo can build
          the Word document — your prose and its works-cited page in one file, formatted in
          whichever style the assignment asked for.
        </p>
        <button onClick={() => setStage('question')} className="btn-primary text-xs self-start">
          Start with a question
        </button>
      </SurfaceShell>
    )
  }

  return (
    <SurfaceShell
      eyebrow="Export"
      title="Ready to hand in"
      aside={<span className="record">{words.toLocaleString()} words · {sources.length} sources</span>}
    >
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3.5
          flex flex-col gap-2.5">
          <span className="eyebrow !text-amber-600 dark:!text-amber-400">
            Worth fixing before you submit
          </span>
          {warnings.map(w => (
            <div key={w.key} className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[12.5px] text-t1 leading-relaxed">{w.text}</p>
              <button
                onClick={() => setStage(w.key)}
                className="btn-ghost shrink-0"
              >
                {w.action}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* The paper as it will read, not as it is edited: no caret, no marks, no
          growing textarea. Seeing it set as a page is most of what a final
          check is for. */}
      {doc.trim() && (
        <div className="sheet px-7 sm:px-9 py-8">
          <div className="canvas-type text-t1">{doc}</div>
        </div>
      )}

      <BibliographyBlock />
    </SurfaceShell>
  )
}
