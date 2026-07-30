/**
 * Firmo for Word.
 *
 * The same job as the Google Docs add-on, in the editor most departments hand
 * out a template for: the project's saved sources, an in-text citation at the
 * cursor, and a works-cited page built from the publisher's record rather than
 * typed out by hand at 2am.
 *
 * Unlike the Docs add-on this runs in a browser, so it talks to the Firmo API
 * over ordinary fetch from the add-in's own origin, and the session token lives
 * in localStorage scoped to that origin. It is never written into the document,
 * where anyone the file is shared with could read it.
 */

const DEFAULTS = { apiBase: 'https://localhost:8000' }

const state = {
  projects: [],
  projectId: '',
  style: 'apa',
  sources: [],
  // In-text forms and bibliography entries for `sources`, same order, from the
  // server. Recomputed whenever the project or the style changes.
  formatted: [],
  projectName: '',
}

const root = () => document.getElementById('root')

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value)
  }
  children.forEach(child => node.appendChild(child))
  return node
}

function render(nodes) {
  root().replaceChildren(...nodes)
}

// ── Firmo API ───────────────────────────────────────────────────────────────

const apiBase = () =>
  (localStorage.getItem('firmo_api') || DEFAULTS.apiBase).replace(/\/+$/, '')

const token = () => localStorage.getItem('firmo_token') || ''

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth && token()) headers.Authorization = `Bearer ${token()}`
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    localStorage.removeItem('firmo_token')
    throw Object.assign(new Error('Your Firmo session expired. Sign in again.'),
      { signedOut: true })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Firmo returned ${res.status}`)
  return data
}

/**
 * In-text forms and bibliography entries for the whole project, from the server.
 *
 * Both come from the same call because the server is the only place that knows
 * the CSL rules. Hand-rolling "(Surname, Year)" here is simply wrong in two of
 * the five styles Firmo offers — IEEE numbers its citations and MLA carries a
 * page locator — and a citation that is confidently wrong is worse than one the
 * student knows to check.
 */
async function formatProject(sources, style) {
  if (!sources.length) return []
  const formatted = await api('/api/export', {
    method: 'POST',
    body: { papers: sources, style, format: 'text' },
  })
  return (formatted.entries || []).map((entry, i) => ({
    // IEEE returns "[#]", numbered by position in the reference list. This
    // add-in writes that list, in this order, so the number is known here.
    intext: String(entry.intext || '').replace('[#]', `[${i + 1}]`),
    citation: entry.citation || '',
  }))
}

// ── Writing into the document ───────────────────────────────────────────────

async function insertCitation(text) {
  await Word.run(async context => {
    // insertText at the selection is the cursor when nothing is selected, and
    // replaces the selection when something is — which is what a student
    // pressing Cite with text highlighted means.
    const range = context.document.getSelection()
    range.insertText(text, Word.InsertLocation.end)
    await context.sync()
  })
}

/**
 * The works-cited page: a page break, the heading the style actually requires,
 * and one hanging-indented paragraph per source.
 *
 * Entries arrive containing real HTML — `<i>` around journal and book titles,
 * `&amp;` for ampersands — because that is what CrossRef returns. Inserted raw
 * they would print the tags into the bibliography, so `insertHtml` is used and
 * lets Word turn them into genuine italics.
 */
async function insertWorksCited(entries, style) {
  const heading = style === 'mla' ? 'Works Cited' : 'References'
  await Word.run(async context => {
    const body = context.document.body
    body.insertBreak(Word.BreakType.page, Word.InsertLocation.end)

    const title = body.insertParagraph(heading, Word.InsertLocation.end)
    title.styleBuiltIn = Word.Style.heading1
    title.alignment = Word.Alignment.centered

    for (const entry of entries) {
      const paragraph = body.insertParagraph('', Word.InsertLocation.end)
      paragraph.styleBuiltIn = Word.Style.normal
      paragraph.insertHtml(entry, Word.InsertLocation.replace)
      // A real hanging indent: the whole entry indents and the first line pulls
      // back, which is what both style guides require and what a line of spaces
      // only pretends to be.
      paragraph.leftIndent = 36
      paragraph.firstLineIndent = -36
      paragraph.lineSpacing = 24
      paragraph.spaceAfter = 0
    }

    await context.sync()
  })
}

// ── Screens ─────────────────────────────────────────────────────────────────

function fail(message) {
  render([el('p', { class: 'record error', text: message })])
}

function signInScreen(message) {
  const email = el('input', { type: 'email', placeholder: 'you@university.edu' })
  const password = el('input', { type: 'password' })
  const error = el('p', { class: 'record error', text: message || '' })
  const button = el('button', { text: 'Sign in' })

  button.addEventListener('click', async () => {
    button.disabled = true
    error.textContent = ''
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: email.value.trim(), password: password.value },
      })
      localStorage.setItem('firmo_token', data.token)
      loadProjects()
    } catch (e) {
      button.disabled = false
      error.textContent = e.message
    }
  })

  render([
    el('p', { text: 'Sign in to bring your sources into this document.' }),
    el('label', {}, [el('span', { class: 'eyebrow', text: 'Email' }), email]),
    el('label', {}, [el('span', { class: 'eyebrow', text: 'Password' }), password]),
    button,
    error,
    addressButton(),
  ])
}

function addressButton() {
  return el('button', {
    class: 'ghost',
    text: 'Change Firmo address',
    onclick: () => {
      const input = el('input', { type: 'url', value: apiBase() })
      render([
        el('p', { class: 'eyebrow', text: 'Firmo address' }),
        input,
        el('button', {
          text: 'Save',
          onclick: () => {
            localStorage.setItem('firmo_api', input.value.trim().replace(/\/+$/, ''))
            // A token from one deployment means nothing to another.
            localStorage.removeItem('firmo_token')
            signInScreen('Signed out. Sign in to the new address.')
          },
        }),
      ])
    },
  })
}

async function loadProjects() {
  render([el('p', { class: 'record', text: 'Loading your papers…' })])
  try {
    const { projects } = await api('/api/projects')
    state.projects = projects || []
    if (!state.projects.length) {
      return render([
        el('p', {
          text: 'No papers in your Firmo account yet. Start one in Firmo, save a source, then come back.',
        }),
      ])
    }
    state.projectId = state.projects[0].id
    loadSources()
  } catch (e) {
    if (e.signedOut) return signInScreen(e.message)
    fail(e.message)
  }
}

async function loadSources() {
  render([el('p', { class: 'record', text: 'Loading sources…' })])
  try {
    const data = await api('/api/sync', { method: 'POST', body: { projects: [] } })
    const project = (data.projects || []).find(p => p.id === state.projectId)
    if (!project) return fail('That paper is no longer in your Firmo account.')
    state.projectName = project.name
    state.sources = (project.data && project.data.sources) || []
    state.formatted = await formatProject(state.sources, state.style)
    mainScreen()
  } catch (e) {
    if (e.signedOut) return signInScreen(e.message)
    fail(e.message)
  }
}

function mainScreen() {
  const status = el('p', { class: 'record', text: '' })

  const projectSelect = el('select', {
    onchange: e => { state.projectId = e.target.value; loadSources() },
  })
  state.projects.forEach(p => {
    const option = el('option', { value: p.id, text: p.name })
    if (p.id === state.projectId) option.selected = true
    projectSelect.appendChild(option)
  })

  // Changing style re-formats server side rather than re-deriving locally, so
  // the pane and the document never disagree about what APA looks like.
  const styleSelect = el('select', {
    onchange: e => { state.style = e.target.value; loadSources() },
  })
  ;[['apa', 'APA 7'], ['mla', 'MLA 9'], ['chicago', 'Chicago'],
    ['harvard', 'Harvard'], ['ieee', 'IEEE']].forEach(([value, label]) => {
    const option = el('option', { value, text: label })
    if (value === state.style) option.selected = true
    styleSelect.appendChild(option)
  })

  const worksCited = el('button', {
    text: 'Add works-cited page',
    onclick: async () => {
      worksCited.disabled = true
      status.textContent = 'Building the page…'
      try {
        const entries = state.formatted
          .map(e => e.citation)
          .filter(text => text.trim())
        await insertWorksCited(entries, state.style)
        status.textContent = `${entries.length} entries added at the end of the document.`
      } catch (e) {
        status.textContent = e.message
      } finally {
        worksCited.disabled = false
      }
    },
  })

  const nodes = [
    el('label', {}, [el('span', { class: 'eyebrow', text: 'Paper' }), projectSelect]),
    el('label', {}, [el('span', { class: 'eyebrow', text: 'Style' }), styleSelect]),
    el('hr'),
    el('p', { class: 'eyebrow', text: `${state.sources.length} saved sources` }),
  ]

  state.sources.forEach((paper, i) => {
    const citation = (state.formatted[i] || {}).intext || ''
    nodes.push(el('div', { class: 'source' }, [
      el('p', { class: 'title', text: paper.title || 'Untitled' }),
      el('p', {
        class: 'record',
        text: [(paper.authors || [])[0], paper.year, paper.journal]
          .filter(Boolean).join(' · '),
      }),
      el('button', {
        class: 'ghost',
        text: `Cite ${citation}`,
        onclick: async () => {
          try {
            await insertCitation(` ${citation}`)
            status.textContent = 'Inserted at your cursor.'
          } catch (e) {
            status.textContent = e.message
          }
        },
      }),
    ]))
  })

  nodes.push(el('hr'), worksCited, status)
  nodes.push(el('button', {
    class: 'ghost',
    text: 'Sign out',
    onclick: () => { localStorage.removeItem('firmo_token'); signInScreen() },
  }))

  render(nodes)
}

// Office decides when the host is ready; nothing may touch Word before this.
Office.onReady(info => {
  if (info.host !== Office.HostType.Word) {
    return fail('Firmo runs in Word documents.')
  }
  if (token()) loadProjects()
  else signInScreen()
})
