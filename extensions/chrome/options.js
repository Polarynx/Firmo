// Where this copy of the extension should talk to.
//
// Firmo is self-hosted per deployment, so the addresses cannot be baked in. A
// student installing from the store gets the defaults; anyone running their own
// backend, or a university running an internal one, changes them here.

const DEFAULTS = { apiBase: 'http://localhost:8000', appBase: 'http://localhost:5173' }

const $ = id => document.getElementById(id)

chrome.storage.local.get(['apiBase', 'appBase']).then(stored => {
  $('apiBase').value = stored.apiBase || DEFAULTS.apiBase
  $('appBase').value = stored.appBase || DEFAULTS.appBase
})

$('form').addEventListener('submit', async event => {
  event.preventDefault()
  const apiBase = $('apiBase').value.trim().replace(/\/+$/, '')
  const appBase = $('appBase').value.trim().replace(/\/+$/, '')

  // Permission to reach the deployment is asked for here, once, against the one
  // origin the student named — rather than declared up front as "read all your
  // sites". An extension that asks for every site is one a university IT desk
  // is right to block, and it would be asking for far more than saving a paper
  // needs.
  if (/^https:\/\//i.test(apiBase)) {
    const origin = new URL(apiBase).origin + '/*'
    const granted = await chrome.permissions.request({ origins: [origin] })
    if (!granted) {
      $('saved').textContent = 'Not saved: Firmo needs permission to reach that address.'
      return
    }
  }

  await chrome.storage.local.set({ apiBase, appBase })
  // Changing the backend invalidates the session: a token minted by one
  // deployment means nothing to another, and leaving it in place would fail on
  // the next save with an error that looks like a bug.
  await chrome.storage.local.remove('token')
  $('saved').textContent = 'Saved. Sign in again from the popup.'
})
