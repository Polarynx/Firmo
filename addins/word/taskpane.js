/* Firmo for Word — task pane logic.
 *
 * Plain ES2020, no bundler. An Office add-in is loaded as files by a webview,
 * and a build step here would buy nothing except a build step; the whole pane is
 * three hundred lines and has one dependency, which Office injects itself.
 *
 * The one rule this file follows throughout: never touch the document without
 * being asked. Word documents are the thing a student is graded on, there is no
 * version history in a .docx sitting on a desktop, and an add-in that silently
 * rewrites a sentence is an add-in that gets uninstalled after it eats one
 * paragraph. Every write is behind a press, and highlighting — the only bulk
 * change — is a checkbox that can be turned off before the run and undone after.
 */

const API = (localStorage.getItem('firmo_api') || 'https://firmo.app').replace(/\/$/, '')

// Word's highlight palette is a fixed set of named colours, so the workspace's
// amber/red/green ramp has to be approximated rather than matched. These are the
// three that read correctly on white at 11pt.
const HIGHLIGHT = {
  needs_citation: '#FFE699',   // amber — wants a source
  shaky:          '#FFC7CE',   // red   — the evidence disagrees
  backed:         '#C6E0B4',   // green — already covered
  cited:          '#C6E0B4',
}

const el = id => document.getElementById(id)
const statusEl = () => el('status')

function setStatus(text) { statusEl().textContent = text || '' }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ── Office bootstrap ────────────────────────────────────────────────────────

Office.onReady(info => {
  if (info.host !== Office.HostType.Word) {
    document.body.innerHTML =
      '<p class="lede" style="padding:16px">Firmo runs inside Word. Open a document and try again.</p>'
    return
  }
  el('host-note').textContent = info.platform === Office.PlatformType.OfficeOnline
    ? 'Word for the web' : 'Word'

  el('tab-claims').onclick = () => showPane('claims')
  el('tab-refs').onclick = () => showPane('refs')
  el('run-claims').onclick = () => runClaims().catch(fail)
  el('run-refs').onclick = () => runRefs().catch(fail)
})

function showPane(which) {
  const on = which === 'claims'
  el('tab-claims').classList.toggle('is-on', on)
  el('tab-refs').classList.toggle('is-on', !on)
  el('tab-claims').setAttribute('aria-selected', String(on))
  el('tab-refs').setAttribute('aria-selected', String(!on))
  el('pane-claims').classList.toggle('is-hidden', !on)
  el('pane-refs').classList.toggle('is-hidden', on)
}

function fail(e) {
  console.error(e)
  setStatus('')
  const box = el('pane-refs').classList.contains('is-hidden') ? el('claims-out') : el('refs-out')
  box.innerHTML = `<p class="err">${esc(e.message || 'Something went wrong.')}</p>`
}

// ── Reading the document ────────────────────────────────────────────────────

async function readBody() {
  return Word.run(async ctx => {
    const body = ctx.document.body
    body.load('text')
    await ctx.sync()
    return body.text || ''
  })
}

/**
 * The reference list, separated from the prose.
 *
 * A .docx has no structure saying "this part is the bibliography", so it is
 * found the way a reader finds it: the last heading that says so, and everything
 * after it. Falling back to the whole document is deliberate — the citation
 * checker already ignores anything that does not parse as a reference, so a
 * false negative here costs nothing and a false positive would silently check
 * half the entries.
 */
async function readReferences() {
  return Word.run(async ctx => {
    const paras = ctx.document.body.paragraphs
    paras.load('items/text')
    await ctx.sync()

    const texts = paras.items.map(p => p.text)
    const headed = /^\s*(works\s+cited|references|bibliography|reference\s+list)\s*:?\s*$/i
    let start = -1
    texts.forEach((t, i) => { if (headed.test(t)) start = i })
    if (start === -1) return texts.join('\n')
    return texts.slice(start + 1).join('\n')
  })
}

// ── The stream ──────────────────────────────────────────────────────────────

/** POST an NDJSON endpoint and hand each parsed line to `onEvent`. */
async function stream(path, body, onEvent) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 429) {
    throw new Error('Firmo is rate limited right now. Give it a minute and try again.')
  }
  if (!res.ok) throw new Error(`Firmo returned ${res.status}.`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try { onEvent(JSON.parse(line)) } catch { /* a partial line; the next read completes it */ }
    }
  }
}

// ── Pass 1: claims ──────────────────────────────────────────────────────────

let lastClaims = []

async function runClaims() {
  const out = el('claims-out')
  out.innerHTML = ''
  const text = await readBody()
  if (text.trim().split(/\s+/).length < 40) {
    out.innerHTML = '<p class="note">Write a paragraph or two first — there is nothing to check yet.</p>'
    return
  }

  el('run-claims').disabled = true
  setStatus('Reading…')
  lastClaims = []

  try {
    await stream('/api/draft-check', { text, saved_papers: [] }, ev => {
      if (ev.event === 'status') setStatus(ev.message || '')
      if (ev.event === 'claims') { lastClaims = ev.claims || []; renderClaims(out) }
      if (ev.event === 'claim') {
        const i = lastClaims.findIndex(c => c.id === ev.id)
        if (i >= 0) lastClaims[i] = { ...lastClaims[i], ...ev }
        renderClaims(out)
      }
      if (ev.event === 'error') throw new Error(ev.message)
    })
    setStatus('')
    if (el('opt-highlight').checked) await highlightClaims(lastClaims)
    renderClaims(out)
  } finally {
    el('run-claims').disabled = false
    setStatus('')
  }
}

const LABEL = {
  needs_citation: 'Needs a source',
  shaky: 'Evidence disagrees',
  backed: 'Already covered',
  cited: 'Cited',
  fine: 'No source needed',
  checking: 'Checking…',
}

function renderClaims(out) {
  if (!lastClaims.length) {
    out.innerHTML = '<p class="note">Nothing here needs backing up. Firmo checks factual claims, not opinion or style.</p>'
    return
  }
  const open = lastClaims.filter(c => c.status === 'needs_citation' || c.status === 'shaky')
  out.innerHTML =
    `<p class="count"><b>${open.length}</b> of ${lastClaims.length} still need something.</p>` +
    lastClaims.map((c, i) => `
      <article class="claim s-${esc(c.status)}">
        <span class="tag">${esc(LABEL[c.status] || c.status)}</span>
        <p class="quote">${esc(c.claim || c.quote)}</p>
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
        ${(c.sources || []).slice(0, 2).map((p, j) => `
          <div class="src">
            <span class="t">${esc(p.title)}</span>
            <span class="m">${esc([p.authors?.[0], p.year, p.journal].filter(Boolean).join(' · '))}</span>
            <button class="ghost" data-cite="${i}:${j}">Insert citation</button>
          </div>`).join('')}
      </article>`).join('')

  out.querySelectorAll('[data-cite]').forEach(b => {
    b.onclick = () => {
      const [i, j] = b.dataset.cite.split(':').map(Number)
      insertCitation(lastClaims[i], lastClaims[i].sources[j], b).catch(fail)
    }
  })
}

/**
 * Paint the claims onto the document.
 *
 * `search` is given the claim's own quote, which is exact text lifted from this
 * document, so it matches. Word caps a search string at 255 characters and
 * treats several punctuation marks as wildcards, so a long or quote-heavy
 * sentence is searched by a safe leading fragment instead of being skipped —
 * a highlight on most of the sentence beats no highlight at all.
 */
async function highlightClaims(claims) {
  setStatus('Marking the document…')
  await Word.run(async ctx => {
    for (const c of claims) {
      const colour = HIGHLIGHT[c.status]
      if (!colour) continue
      const needle = (c.quote || '').replace(/[\^#\*\?\[\]\\<>&@~]/g, ' ').trim().slice(0, 200)
      if (needle.length < 12) continue
      const found = ctx.document.body.search(needle, { matchCase: false, ignorePunct: true })
      found.load('items')
      await ctx.sync()
      for (const r of found.items) r.font.highlightColor = colour
    }
    await ctx.sync()
  })
  setStatus('')
}

// ── Writing back ────────────────────────────────────────────────────────────

/**
 * Put the citation into the sentence it belongs to, and the source into the
 * works-cited page. One press, both effects — the same bargain the web
 * workspace makes, because doing half of it leaves the student with a citation
 * pointing at a bibliography entry that does not exist.
 */
async function insertCitation(claim, paper, button) {
  button.disabled = true
  const style = localStorage.getItem('firmo_style') || 'apa'

  let inline = ''
  let entry = ''
  try {
    const res = await fetch(`${API}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ papers: [paper], style, format: 'text' }),
    })
    if (res.ok) entry = (await res.json()).content || ''
  } catch { /* the in-text citation is still worth inserting without it */ }

  const surname = (paper.authors?.[0] || '').trim().split(/\s+/).pop() || 'Author'
  inline = paper.year ? `(${surname}, ${paper.year})` : `(${surname})`

  await Word.run(async ctx => {
    const needle = (claim.quote || '').replace(/[\^#\*\?\[\]\\<>&@~]/g, ' ').trim().slice(0, 200)
    const found = ctx.document.body.search(needle, { matchCase: false, ignorePunct: true })
    found.load('items')
    await ctx.sync()

    if (found.items.length) {
      const r = found.items[0]
      r.load('text')
      await ctx.sync()
      // Before the closing full stop, the way a citation is actually written.
      const t = r.text
      const trailing = /[.!?]$/.test(t)
      r.insertText(trailing ? `${t.slice(0, -1)} ${inline}${t.slice(-1)}` : `${t} ${inline}`, 'Replace')
      r.font.highlightColor = HIGHLIGHT.cited
    } else {
      ctx.document.getSelection().insertText(` ${inline}`, 'End')
    }

    if (entry) await appendToBibliography(ctx, entry.trim())
    await ctx.sync()
  })

  claim.status = 'cited'
  renderClaims(el('claims-out'))
}

/**
 * Add one entry to the works-cited page, creating the heading if the document
 * does not have one yet. Appending to the body is the fallback rather than the
 * default: a student who has already written "References" expects the entry to
 * land under it, not at the end of whatever was last on the page.
 */
async function appendToBibliography(ctx, entry) {
  const paras = ctx.document.body.paragraphs
  paras.load('items/text')
  await ctx.sync()

  const headed = /^\s*(works\s+cited|references|bibliography|reference\s+list)\s*:?\s*$/i
  const items = paras.items
  let head = -1
  items.forEach((p, i) => { if (headed.test(p.text)) head = i })

  if (head === -1) {
    const h = ctx.document.body.insertParagraph('References', 'End')
    h.styleBuiltIn = Word.Style.heading1
    const p = h.insertParagraph(entry, 'After')
    p.styleBuiltIn = Word.Style.normal
    return
  }

  // Already there? Adding a second copy of the same reference is worse than
  // doing nothing, and it is the kind of mistake nobody notices before printing.
  const key = entry.slice(0, 60).toLowerCase()
  if (items.slice(head + 1).some(p => p.text.toLowerCase().includes(key))) return

  const last = items[items.length - 1]
  const p = last.insertParagraph(entry, 'After')
  p.styleBuiltIn = Word.Style.normal
}

// ── Pass 2: references ──────────────────────────────────────────────────────

const VERDICT = {
  verified:   ['ok',    'Matches the record'],
  mismatch:   ['warn',  'Check the details'],
  retracted:  ['bad',   'Retracted'],
  not_found:  ['bad',   'Not found'],
  unchecked:  ['muted', 'Not checked'],
  checking:   ['muted', 'Checking…'],
}

async function runRefs() {
  const out = el('refs-out')
  out.innerHTML = ''
  const text = await readReferences()
  if (!text.trim()) {
    out.innerHTML = '<p class="note">No reference list found in this document.</p>'
    return
  }

  el('run-refs').disabled = true
  setStatus('Reading your reference list…')
  let items = []

  try {
    await stream('/api/check-citations', { text }, ev => {
      if (ev.event === 'status') setStatus(ev.message || '')
      if (ev.event === 'entries') {
        items = (ev.items || []).map(i => ({ ...i, verdict: 'checking' }))
        renderRefs(out, items)
      }
      if (ev.event === 'result') {
        const { event, index, ...patch } = ev
        if (items[index]) items[index] = { ...items[index], ...patch }
        renderRefs(out, items)
      }
      if (ev.event === 'error') throw new Error(ev.message)
    })
  } finally {
    el('run-refs').disabled = false
    setStatus('')
  }
}

function renderRefs(out, items) {
  const suspect = items.filter(i => i.verdict === 'not_found' || i.verdict === 'retracted').length
  out.innerHTML =
    (suspect
      ? `<p class="alarm">${suspect} entr${suspect === 1 ? 'y' : 'ies'} could not be matched to a real
         published record, or has been retracted. Fix these before you submit.</p>`
      : '') +
    `<p class="count">${items.length} entr${items.length === 1 ? 'y' : 'ies'} checked</p>` +
    items.map(i => {
      const [cls, label] = VERDICT[i.verdict] || VERDICT.checking
      return `
        <article class="ref v-${cls}">
          <span class="tag">${esc(label)}</span>
          <p class="raw">${esc(i.raw)}</p>
          ${i.note ? `<p class="note">${esc(i.note)}</p>` : ''}
          ${i.matched?.url ? `<a class="link" href="${esc(i.matched.url)}" target="_blank" rel="noopener">Open the record ↗</a>` : ''}
        </article>`
    }).join('')
}
