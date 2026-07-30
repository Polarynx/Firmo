import './lib/devReset' // must come before anything that reads localStorage
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './index.css'

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
      <App />
    </MotionConfig>
  </React.StrictMode>
)
