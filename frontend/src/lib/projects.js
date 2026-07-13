// Project store: one project per paper, persisted in localStorage.

const KEY = 'firmo_projects_v1'

export function paperId(paper) {
  return paper.doi || paper.url || (paper.title || '').slice(0, 60)
}

function makeId() {
  return (crypto.randomUUID?.() || `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`)
}

export function newProject(name) {
  return { id: makeId(), name: name.trim() || 'Untitled paper', createdAt: Date.now(), sources: [] }
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const store = JSON.parse(raw)
      if (Array.isArray(store.projects)) return store
    }
  } catch {}

  // First run: migrate previously saved papers into a starter project
  const store = { projects: [], activeId: null }
  try {
    const legacy = JSON.parse(localStorage.getItem('firmo_saved') || '[]')
    if (Array.isArray(legacy) && legacy.length > 0) {
      const project = newProject('Saved sources')
      project.sources = legacy
      store.projects = [project]
      store.activeId = project.id
      localStorage.removeItem('firmo_saved')
    }
  } catch {}
  saveStore(store)
  return store
}

export function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {}
}
