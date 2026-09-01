import { motion } from 'framer-motion'

import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useUIStore } from '../../stores/useUIStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { clearExampleState, isExampleProject } from '../../lib/example'
import { SPRING } from '../../lib/constants'

// ── "This one isn't yours" ──────────────────────────────────────────────────
//
// The worked example is a real project in a real workspace, which is what makes
// it useful and also what makes this necessary. Everything on screen — six
// saved papers, an outline, a drafted argument with its claims marked — looks
// exactly like work somebody did, because it is indistinguishable from it.
//
// Firmo's whole claim is that it can say what a student actually did. A tool
// making that claim cannot leave a paper it wrote itself sitting in their
// workspace under no particular label, one project switch away from being
// mistaken for their own. So the example says what it is, on every screen, for
// as long as it exists, and offers the two ways out: start something real, or
// remove it.

export default function ExampleNote() {
  const project = useWorkspaceStore(s => s.projects.find(p => p.id === s.activeProjectId) || null)
  const deleteProject = useWorkspaceStore(s => s.deleteProject)
  const createProject = useWorkspaceStore(s => s.createProject)
  const setStage = useUIStore(s => s.setStage)

  if (!isExampleProject(project)) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="flex items-center gap-3 flex-wrap px-4 py-2 border-b border-line
        bg-brand-500/[0.05] dark:bg-signal/[0.06]"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-signal shrink-0" />
      <p className="text-[11.5px] text-t2 leading-relaxed min-w-0">
        <span className="font-medium text-t1">This is an example paper, not yours.</span>{' '}
        The sources are real and every control works, so it is a safe thing to take
        apart. Nothing here counts towards your own record.
      </p>
      <div className="flex items-center gap-3 ml-auto shrink-0">
        <button
          onClick={() => {
            // The new project clears the sources, because those belong to it.
            // The question, brief, outline, draft and citations do not - they
            // are global state the example seeded - so they have to be cleared
            // too, or the student's first paper opens holding someone else's.
            createProject('Untitled paper')
            clearExampleState({ useResearchStore, useAnnotationStore })
            setStage('question')
          }}
          className="text-[11.5px] font-medium text-brand-600 dark:text-signal hover:opacity-75
            transition-opacity"
        >
          Start my own
        </button>
        <span className="text-t3 text-[11px]">·</span>
        <button
          onClick={() => {
            if (!project) return
            deleteProject(project.id)
            clearExampleState({ useResearchStore, useAnnotationStore })
          }}
          className="text-[11.5px] font-medium text-t3 hover:text-t1 transition-colors"
        >
          Remove the example
        </button>
      </div>
    </motion.div>
  )
}
