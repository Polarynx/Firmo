import WorkspaceLayout from './components/workspace/WorkspaceLayout'

// Firmo is one workspace, not a suite of tools. Everything lives in
// WorkspaceLayout: the document canvas, the context panel that follows it, and
// the omni-bar underneath. State is in src/stores.
export default function App() {
  return <WorkspaceLayout />
}
