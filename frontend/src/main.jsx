import './lib/devReset' // must come before anything that reads localStorage
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// `?lab` boots into a paper already in progress, so the workspace can be looked
// at without spending a live search to reach a populated state. Dev only; the
// import is static because the tree-shake drops it from production builds where
// `import.meta.env.DEV` is statically false.
import { isLab, seedLab } from './lib/lab'
import { useWorkspaceStore } from './stores/useWorkspaceStore'
import { useResearchStore } from './stores/useResearchStore'
import { useAnnotationStore } from './stores/useAnnotationStore'

if (isLab) {
  seedLab({ useWorkspaceStore, useResearchStore, useAnnotationStore })
}

// `reducedMotion="user"` makes every Framer Motion animation in the workspace
// honour the operating system's reduce-motion setting, rather than each
// component having to remember to check. The CSS side is handled by the
// prefers-reduced-motion block in index.css; this is the other half.
//
// Framer's own handling is the right behaviour here: transforms and opacity
// stop moving, while colour and layout transitions still resolve — so a claim
// still visibly turns green when it gets backed, it just does not fly.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </MotionConfig>
  </React.StrictMode>
)
