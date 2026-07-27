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
  if (!res.ok) throw new Error(`Server error: ${res.status}`)
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
  if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`)

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
    throw new Error(data.detail || `Server error: ${res.status}`)
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
