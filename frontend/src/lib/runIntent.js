import { detectIntent } from './claims'
import { useAnnotationStore } from '../stores/useAnnotationStore'
import { useResearchStore } from '../stores/useResearchStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

// One entry point for "do the thing this text is asking for". The canvas, the
// omni-bar, and the command palette all route through here, which is what
// makes the workspace feel like one surface instead of three tools.

export function runIntent(text, override) {
  const intent = override || detectIntent(text)
  if (intent === 'empty') return intent

  if (intent === 'search') {
    useResearchStore.getState().executeSearch(text)
  } else if (intent === 'citations') {
    useAnnotationStore.getState().checkCitations(text)
  } else if (intent === 'draft') {
    const saved = useWorkspaceStore.getState().savedSources()
    useAnnotationStore.getState().checkDraft(text, saved)
  }
  return intent
}

/** Stop whatever is currently streaming. */
export function cancelActive() {
  const mode = useWorkspaceStore.getState().activeMode
  if (mode === 'searching') useResearchStore.getState().cancel()
  else if (mode === 'draft_checking') useAnnotationStore.getState().cancelDraft()
  else if (mode === 'citation_auditing') useAnnotationStore.getState().cancelCitations()
}
