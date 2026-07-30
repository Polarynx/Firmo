import PublicRecord from './components/PublicRecord'
import WorkspaceLayout from './components/workspace/WorkspaceLayout'

// Firmo is one workspace, not a suite of tools. Everything lives in
// WorkspaceLayout: the document canvas, the context panel that follows it, and
// the omni-bar underneath. State is in src/stores.
//
// The one exception is a shared process record. That page has a different
// audience — an instructor following a link out of a submission — and must load
// with no account, no stores, and no workspace behind it, so it is matched on
// the path before anything else mounts. A router would be four dependencies for
// this one branch.
export default function App() {
  const shared = window.location.pathname.match(/^\/record\/([A-Za-z0-9_-]{8,})\/?$/)
  if (shared) return <PublicRecord token={shared[1]} />
  return <WorkspaceLayout />
}
