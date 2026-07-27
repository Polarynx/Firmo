import { useMemo } from 'react'
import { useWorkspaceStore } from './useWorkspaceStore'
import { paperId } from '../lib/projects'

// Derived reads of the workspace store.
//
// Zustand compares selector results by identity, so a selector that builds a
// value (`|| []`, `new Set(...)`, `.map(...)`) hands back a fresh reference on
// every render and spins the component forever. These hooks return stable
// references: a module-level empty array for the miss case, and useMemo for
// anything genuinely derived.

const EMPTY = []

export function useActiveProject() {
  return useWorkspaceStore(s => s.projects.find(p => p.id === s.activeProjectId) || null)
}

export function useSavedSources() {
  return useWorkspaceStore(s => s.projects.find(p => p.id === s.activeProjectId)?.sources || EMPTY)
}

export function useSavedIds() {
  const sources = useSavedSources()
  return useMemo(() => new Set(sources.map(paperId)), [sources])
}
