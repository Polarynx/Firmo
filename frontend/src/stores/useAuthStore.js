import { create } from 'zustand'
import { API } from '../lib/api'

// Who is signed in.
//
// Firmo works signed out — a student should be able to run a search before
// being asked for anything. The account is what makes the work persist: their
// papers follow them to the library computer, survive a cleared browser, and
// stop sharing a daily allowance with everyone else on campus wifi.

const TOKEN_KEY = 'firmo_token'
const USER_KEY = 'firmo_user'

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function store(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {}
}

/** The current token, for modules that need it without subscribing. */
export function authToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Something went wrong. Try again.')
  return data
}

export const useAuthStore = create((set, get) => ({
  token: authToken(),
  user: loadUser(),
  busy: false,
  error: '',

  isSignedIn: () => !!get().token,

  setError: error => set({ error }),

  async register(email, password, name = '') {
    set({ busy: true, error: '' })
    try {
      const data = await post('/api/auth/register', { email, password, name })
      store(data.token, data.user)
      set({ token: data.token, user: data.user, busy: false })
      return true
    } catch (e) {
      set({ busy: false, error: e.message })
      return false
    }
  },

  async signIn(email, password) {
    set({ busy: true, error: '' })
    try {
      const data = await post('/api/auth/login', { email, password })
      store(data.token, data.user)
      set({ token: data.token, user: data.user, busy: false })
      return true
    } catch (e) {
      set({ busy: false, error: e.message })
      return false
    }
  },

  /**
   * Sign out without touching the local projects. The work stays on this
   * machine and is already on the server; wiping it here would look like
   * Firmo deleted the student's paper for signing out.
   */
  signOut() {
    store(null, null)
    set({ token: null, user: null, error: '' })
  },

  /** Called when the server rejects the token, e.g. after it expires. */
  sessionExpired() {
    store(null, null)
    set({ token: null, user: null, error: 'Your session expired. Sign in again.' })
  },
}))
