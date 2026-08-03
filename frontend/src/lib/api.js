export const API = import.meta.env.VITE_API_URL || ''

// A stable id for this browser, so the daily allowance follows the person
// rather than their IP address. Without it, everyone behind one campus NAT
// shares a single student's quota and the whole building gets locked out.
const CLIENT_KEY = 'firmo_client_id'

function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY)
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      localStorage.setItem(CLIENT_KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const id = clientId()
  if (id) h['X-Firmo-Client'] = id
  // Read straight from storage rather than importing the auth store: api.js is
  // imported by the stores themselves, and going the other way would be a cycle.
  try {
    const token = localStorage.getItem('firmo_token')
    if (token) h.Authorization = `Bearer ${token}`
  } catch {}
  return h
}


// ── What went wrong, in a sentence a student can act on ─────────────────────
//
// "Server error: 500" and "Failed to fetch" are true and useless. They tell
// somebody who has just lost their place that a number happened. Worse, "Is the
// backend running?" — which shipped — is a question only a developer can answer,
// asked of a student.
//
// Every failure here is one of about six things, and each has a next step:
// wait, check your connection, shorten the text, sign in again, or tell us.
export function humanError(status, detail) {
  // A detail from our own API is already written for a person; the endpoints
  // that produce them say things like "That file is larger than 8 MB."
  if (detail && !/^[A-Z][a-z]+Error:/.test(detail) && detail.length < 240) return detail

  if (status === 0) {
    return 'Firmo could not be reached. Check your connection and try again in a moment.'
  }
  if (status === 401 || status === 403) {
    return 'Your session has expired. Sign in again and your work will still be here.'
  }
  if (status === 413) {
    return 'That is too much text for one go. Try it in a couple of smaller pieces.'
  }
  if (status === 429) {
    return 'That is a lot of requests in a short time. Give it a minute and try again.'
  }
  if (status >= 500) {
    return 'Something broke on our side, not yours. Try again in a moment; nothing was lost.'
  }
  return 'That did not work. Try again in a moment.'
}

/** Wrap fetch so a dead connection reads like one, not like a TypeError. */
export async function safeFetch(url, init) {
  try {
    return await fetch(url, init)
  } catch {
    // No status, no response, nothing to inspect: the request never left.
    throw new Error(humanError(0))
  }
}

export async function postJSON(path, body, signal) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal,
  })
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.detail || 'Daily search limit reached. Come back tomorrow!')
    err.rateLimited = true
    throw err
  }
  if (!res.ok) throw new Error(humanError(res.status))
  return res.json()
}

/**
 * POST to any NDJSON-streaming endpoint.
 * Calls onEvent(eventObject) for every line as it arrives.
 */
export async function streamNDJSON(path, body, { signal, onEvent }) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal,
  })
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.detail || 'Daily search limit reached. Come back tomorrow!')
    err.rateLimited = true
    throw err
  }
  if (!res.ok || !res.body) throw new Error(humanError(res.status))

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line))
      } catch {
        // skip malformed line
      }
    }
  }
}

/**
 * POST and save the response as a file. Used for the .docx export, where the
 * server assembles the document and the browser only has to offer it.
 */
export async function downloadFile(path, body, fallbackName) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(humanError(res.status, data.detail))
  }

  // The server names the file; the disposition header is the only place that
  // name exists, and it is only readable because the API exposes it by CORS.
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = /filename="?([^"';]+)"?/i.exec(disposition)
  const name = match ? match[1] : fallbackName

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return name
}

export function streamResearch(body, opts) {
  return streamNDJSON('/api/research', body, opts)
}
