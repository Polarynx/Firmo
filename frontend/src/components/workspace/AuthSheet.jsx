import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import { SPRING } from '../../lib/constants'
import { useAuthStore } from '../../stores/useAuthStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { EdgeProgress } from '../ui/primitives'

// Signing in.
//
// Nothing here is required to use Firmo — the account exists so the work stops
// living in one browser. The copy says that rather than selling "unlock
// premium features", because that is the actual reason to bother.

export default function AuthSheet({ onClose }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const register = useAuthStore(s => s.register)
  const signIn = useAuthStore(s => s.signIn)
  const busy = useAuthStore(s => s.busy)
  const error = useAuthStore(s => s.error)
  const setError = useAuthStore(s => s.setError)

  const pullFromServer = useWorkspaceStore(s => s.pullFromServer)
  const localCount = useWorkspaceStore(s => s.projects.length)

  useEffect(() => { setError('') }, [mode, setError])

  const creating = mode === 'register'

  async function submit(e) {
    e?.preventDefault()
    if (busy) return
    const ok = creating
      ? await register(email.trim(), password, name.trim())
      : await signIn(email.trim(), password)
    if (!ok) return
    // Whatever is already on this machine goes up with the first sync, so
    // signing in after working anonymously keeps the work rather than
    // replacing it with an empty account.
    await pullFromServer()
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/55 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={SPRING}
        role="dialog"
        aria-label={creating ? 'Create an account' : 'Sign in'}
        className="glass relative w-full max-w-sm p-6 flex flex-col gap-5"
      >
        <EdgeProgress active={busy} />

        <div className="flex flex-col gap-1.5">
          <span className="emblem" aria-hidden="true">F</span>
          <h2 className="font-display font-semibold text-[20px] text-t1 mt-1">
            {creating ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-[12px] text-t2 leading-relaxed">
            {creating
              ? 'Your papers, sources, and drafts follow you to any computer instead of living in one browser.'
              : 'Sign in to pick up your papers where you left them.'}
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {creating && (
            <Field label="Name" optional>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                placeholder="Nithin"
                className={inputClass}
              />
            </Field>
          )}

          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus={!creating}
              placeholder="you@university.edu"
              className={inputClass}
            />
          </Field>

          <Field label="Password" hint={creating ? 'At least 8 characters' : undefined}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={creating ? 'new-password' : 'current-password'}
              required
              minLength={creating ? 8 : undefined}
              className={inputClass}
            />
          </Field>

          {error && (
            <p className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3 py-2
              text-[11.5px] text-red-600 dark:text-red-300 leading-relaxed">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full mt-0.5">
            {busy
              ? (creating ? 'Creating…' : 'Signing in…')
              : (creating ? 'Create account' : 'Sign in')}
          </button>
        </form>

        {creating && localCount > 0 && (
          <p className="text-[11px] text-t3 leading-relaxed -mt-2">
            The {localCount} paper{localCount === 1 ? '' : 's'} already on this computer will be
            saved to your account.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1 border-t border-hair/10">
          <button
            onClick={() => setMode(creating ? 'signin' : 'register')}
            className="text-[11.5px] font-medium text-brand-600 dark:text-signal hover:opacity-75 transition-opacity pt-3"
          >
            {creating ? 'I already have an account' : 'Create an account'}
          </button>
          <button onClick={onClose} className="text-[11.5px] text-t3 hover:text-t2 transition-colors pt-3">
            Not now
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

const inputClass = `w-full rounded-lg border border-hair/10 bg-hair/[0.03] px-3 py-2
  text-[13px] text-t1 placeholder:text-t3 outline-none
  focus:border-brand-500/50 focus:bg-hair/[0.05] transition-colors`

function Field({ label, hint, optional, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {optional && <span className="text-[10px] text-t3">optional</span>}
        {hint && <span className="text-[10px] text-t3">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
