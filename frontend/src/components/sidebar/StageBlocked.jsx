import { useUIStore } from '../../stores/useUIStore'
import { STAGES } from '../../lib/stages'
import { EmptyNote } from '../ui/primitives'

// What a stage says when it cannot run yet.
//
// Firmo used to fail silently here. `/outline` with nothing saved returned
// without a word, and a student pressing a control that visibly does nothing
// concludes the tool is broken rather than that they are early. A refusal is
// only useful if it names the thing that is missing and offers the way to get
// it — which is the same standard the citation checker is held to when it
// declines to call a source fake.

export default function StageBlocked({ title, reason, goto, action = 'Go there' }) {
  const setStage = useUIStore(s => s.setStage)
  const target = STAGES.find(s => s.key === goto)

  return (
    <EmptyNote
      title={title}
      action={target && (
        <button onClick={() => setStage(target.key)} className="btn-ghost mt-1">
          {action}
        </button>
      )}
    >
      {reason}
    </EmptyNote>
  )
}
