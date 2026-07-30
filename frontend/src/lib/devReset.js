// Local dev always boots as a brand-new user: no projects, history, or prefs.
// Add ?keep to the URL to opt out while testing multi-session flows.
//
// This lives in its own module because the stores read localStorage while they
// are being imported. ES modules evaluate in import order, so main.jsx has to
// pull this in before anything that touches storage — doing the wipe inline in
// main.jsx would run after App's imports had already read the old values.

// A shared process record is a read-only page for someone else's browser, and
// it is the one URL a student is most likely to open in their own — to check
// what an instructor will see. Wiping storage there would sign them out and
// throw away their local record, so this route is exempt in every environment.
const isSharedRecord = /^\/record\//.test(window.location.pathname)

if (import.meta.env.DEV
  && !isSharedRecord
  && !new URLSearchParams(window.location.search).has('keep')) {
  Object.keys(localStorage)
    .filter(k => k.startsWith('firmo_'))
    .forEach(k => localStorage.removeItem(k))
}
