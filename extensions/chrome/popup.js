// Save to Firmo.
//
// The whole extension is one flow: work out what paper is on the page, ask the
// server to turn it into a real record, and append it to a project. Zotero won
// its category on exactly this button, and the reason is that saving a source
// has to happen where the student finds it — a tool they have to switch tabs to
// feed is a tool they stop feeding.
//
// Everything the popup can go wrong at is named in the interface rather than
// logged: "no paper on this page", "sign in", "already saved". A silent failure
// here reads as a broken extension and gets uninstalled.

const DEFAULTS = { apiBase: 'http://localhost:8000', appBase: 'http://localhost:5173' }

const $ = id => document.getElementById(id)
const view = $('view')

function show(templateId) {
  const tpl = document.getElementById(templateId)
  view.replaceChildren(tpl.content.cloneNode(true))
}

function say(text) {
  view.replaceChildren(Object.assign(document.createElement('p'), {
    className: 'record',
    textContent: text,
  }))
}

async function config() {
  const stored = await chrome.storage.local.get(['apiBase', 'appBase'])
  return {
    apiBase: (stored.apiBase || DEFAULTS.apiBase).replace(/\/+$/, ''),
    appBase: (stored.appBase || DEFAULTS.appBase).replace(/\/+$/, ''),
  }
}

async function token() {
  return (await chrome.storage.local.get('token')).token || ''
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const { apiBase } = await config()
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const t = await token()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    // The session outlived its token. Clearing it here means the next screen is
    // the sign-in form rather than a confusing failure on the save button.
    await chrome.storage.local.remove('token')
    throw Object.assign(new Error('signed out'), { signedOut: true })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Server error ${res.status}`)
  return data
}

/** Run the detector in the tab the student is actually looking at. */
async function detect() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return null
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['detect.js'],
  })
  return result || null
}

let paper = null

async function renderPaper() {
  show('tpl-paper')
  $('paper-title').textContent = paper.title || 'Untitled'
  const bits = [
    (paper.authors || []).slice(0, 2).join(', ') + ((paper.authors || []).length > 2 ? ' et al.' : ''),
    paper.year,
    paper.journal,
  ].filter(Boolean)
  $('paper-meta').textContent = bits.join(' · ') || (paper.doi ? `doi:${paper.doi}` : '')

  const select = $('project')
  try {
    const { projects } = await api('/api/projects')
    if (!projects.length) {
      select.replaceChildren(new Option('Start a new paper', ''))
    } else {
      select.replaceChildren(...projects.map(p => new Option(`${p.name} (${p.sources})`, p.id)))
    }
    const last = (await chrome.storage.local.get('lastProject')).lastProject
    if (last && projects.some(p => p.id === last)) select.value = last
  } catch (e) {
    if (e.signedOut) return renderSignIn()
    select.replaceChildren(new Option('Start a new paper', ''))
  }

  $('save').addEventListener('click', save)
}

async function save() {
  const button = $('save')
  button.disabled = true
  button.textContent = 'Saving…'
  $('save-error').textContent = ''
  try {
    const projectId = $('project').value || ''
    const result = await api('/api/sources/save', {
      method: 'POST',
      body: { project_id: projectId, paper, origin: 'extension' },
    })
    await chrome.storage.local.set({ lastProject: result.project.id })

    const { appBase } = await config()
    show('tpl-done')
    $('done-title').textContent = result.saved
      ? 'Saved'
      : 'Already in this paper'
    $('done-meta').textContent =
      `${result.project.name} · ${result.sources} source${result.sources === 1 ? '' : 's'}`
    $('open-firmo').href = appBase
  } catch (e) {
    if (e.signedOut) return renderSignIn()
    button.disabled = false
    button.textContent = 'Save to Firmo'
    $('save-error').textContent = e.message
  }
}

function renderSignIn() {
  show('tpl-signin')
  $('signin-form').addEventListener('submit', async event => {
    event.preventDefault()
    const error = $('signin-error')
    error.textContent = ''
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: $('email').value.trim(), password: $('password').value },
      })
      await chrome.storage.local.set({ token: data.token })
      if (paper) renderPaper()
      else start()
    } catch (e) {
      error.textContent = e.message === 'signed out' ? 'Wrong email or password.' : e.message
    }
  })
}

async function start() {
  const found = await detect()
  if (!found) return say('Open a paper in a tab and try again.')

  if (found.isResultsPage) {
    return say('This is a list of results. Open the article itself, then save it.')
  }
  if (!found.doi && !found.title) {
    return say("Couldn't find a paper on this page.")
  }

  say('Looking this paper up…')
  try {
    // Resolving happens server side against CrossRef, so what gets saved is the
    // publisher's record — not whatever the page happened to render. That is
    // the difference between a citation that survives a marker checking it and
    // one that does not.
    const data = await api('/api/resolve', {
      method: 'POST',
      auth: false,
      body: { doi: found.doi, title: found.title, url: found.url },
    })
    paper = data.paper
  } catch (e) {
    return say(e.message)
  }

  if (!(await token())) return renderSignIn()
  renderPaper()
}

start()
