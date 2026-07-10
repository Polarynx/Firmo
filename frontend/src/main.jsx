import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Local dev always boots as a brand-new user: no projects, history, or prefs.
// Add ?keep to the URL to opt out while testing multi-session flows.
if (import.meta.env.DEV && !new URLSearchParams(window.location.search).has('keep')) {
  Object.keys(localStorage)
    .filter(k => k.startsWith('firmo_'))
    .forEach(k => localStorage.removeItem(k))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
