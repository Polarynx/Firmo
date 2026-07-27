// Local dev always boots as a brand-new user: no projects, history, or prefs.
// Add ?keep to the URL to opt out while testing multi-session flows.
//
// This lives in its own module because the stores read localStorage while they
// are being imported. ES modules evaluate in import order, so main.jsx has to
// pull this in before anything that touches storage — doing the wipe inline in
// main.jsx would run after App's imports had already read the old values.

if (import.meta.env.DEV && !new URLSearchParams(window.location.search).has('keep')) {
  Object.keys(localStorage)
    .filter(k => k.startsWith('firmo_'))
    .forEach(k => localStorage.removeItem(k))
}
