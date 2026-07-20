export const API = import.meta.env.VITE_API_URL || ''

export async function postJSON(path, body, signal) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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

export function streamResearch(body, opts) {
  return streamNDJSON('/api/research', body, opts)
}
