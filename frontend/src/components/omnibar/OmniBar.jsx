import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedSources } from '../../stores/selectors'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useResearchStore } from '../../stores/useResearchStore'
import { streamNDJSON } from '../../lib/api'
import { runIntent } from '../../lib/runIntent'
import { CITATION_STYLES, SPRING } from '../../lib/constants'
import PopoverCard from './PopoverCard'

// ── Zone C ─────────────────────────────────────────────────────────────────
// One bar for both halves of "what now?": slash commands drive the workspace,
// and anything else is a question put to the sources the student has saved.
// The answer floats out as a card they can move, keep, or throw away.

const STARTERS = [
  { label: 'Synthesize evidence', prompt: 'Synthesize what my saved sources say: where they agree, where they disagree, and the overall picture.' },
  { label: 'Where do sources disagree?', prompt: 'Where do my saved sources disagree or complicate each other? Be specific about which sources are on each side.' },
  { label: 'Outline paper', prompt: 'Outline my paper from these sources: the main points to make in order, and which sources support each point.' },
  { label: "What's missing?", prompt: 'What is the weakest part of my evidence, and what should I search for next to fix it?' },
]

const COMMANDS = [
  { name: 'find',    arg: 'topic',  hint: 'Search 15 databases' },
  { name: 'check',   arg: '',       hint: 'Check the draft in your document' },
  { name: 'verify',  arg: '',       hint: 'Verify the reference list in your document' },
  { name: 'outline', arg: '',       hint: 'Plan the paper from your saved sources' },
  { name: 'format',  arg: 'style',  hint: 'Switch citation style' },
  { name: 'clear',   arg: '',       hint: 'Dismiss the floating cards' },
]

function chatKey(id) { return `firmo_chat_${id}` }

function loadChat(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(chatKey(id)) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

export default function OmniBar() {
  const value = useUIStore(s => s.omniValue)
  const setValue = useUIStore(s => s.setOmniValue)
  const popovers = useUIStore(s => s.popovers)
  const pushPopover = useUIStore(s => s.pushPopover)
  const updatePopover = useUIStore(s => s.updatePopover)
  const closeAllPopovers = useUIStore(s => s.closeAllPopovers)

  const doc = useWorkspaceStore(s => s.doc)
  const projectId = useWorkspaceStore(s => s.activeProjectId)
  const projectName = useWorkspaceStore(s => s.projects.find(p => p.id === s.activeProjectId)?.name || '')
  const sources = useSavedSources()
  const setCitationStyle = useWorkspaceStore(s => s.setCitationStyle)

  const buildOutline = useAnnotationStore(s => s.buildOutline)
  const executeSearch = useResearchStore(s => s.executeSearch)

  const [messages, setMessages] = useState(() => (projectId ? loadChat(projectId) : []))
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  // Each project keeps its own conversation; switching swaps it in.
  useEffect(() => {
    abortRef.current?.abort()
    setMessages(projectId ? loadChat(projectId) : [])
  }, [projectId])

  useEffect(() => () => abortRef.current?.abort(), [])

  // ⌘K focuses the bar from anywhere.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isCommand = value.startsWith('/')
  const matches = useMemo(() => {
    if (!isCommand) return []
    const typed = value.slice(1).split(' ')[0].toLowerCase()
    return COMMANDS.filter(c => c.name.startsWith(typed))
  }, [value, isCommand])

  function runCommand(raw) {
    const [name, ...rest] = raw.slice(1).split(' ')
    const arg = rest.join(' ').trim()
    switch (name.toLowerCase()) {
      case 'find':
        if (arg) executeSearch(arg)
        else if (doc.trim()) runIntent(doc, 'search')
        return true
      case 'check':
        if (doc.trim()) runIntent(doc, 'draft')
        return true
      case 'verify':
        if (doc.trim()) runIntent(doc, 'citations')
        return true
      case 'outline':
        buildOutline(sources)
        return true
      case 'format': {
        const style = CITATION_STYLES.find(
          s => s.key === arg.toLowerCase() || s.label.toLowerCase() === arg.toLowerCase()
        )
        if (style) setCitationStyle(style.key)
        return true
      }
      case 'clear':
        closeAllPopovers()
        return true
      default:
        return false
    }
  }

  async function ask(question) {
    const q = question.trim()
    if (!q || busy) return

    if (q.startsWith('/')) {
      if (runCommand(q)) { setValue(''); return }
    }

    if (sources.length === 0) {
      pushPopover({
        title: q,
        body: 'Save a couple of sources first. This chat only answers from the sources in your project, so it has nothing to read yet.',
      })
      setValue('')
      return
    }

    const history = [...messages, { role: 'user', content: q }]
    const id = pushPopover({ title: q, streaming: true })
    setValue('')
    setBusy(true)
    abortRef.current = new AbortController()

    let answer = ''
    let failed = false
    try {
      await streamNDJSON('/api/paper-chat', {
        messages: history.slice(-12),
        papers: sources,
        project_name: projectName,
      }, {
        signal: abortRef.current.signal,
        onEvent: ev => {
          if (ev.event === 'delta') {
            answer += ev.text
            updatePopover(id, { body: answer })
          } else if (ev.event === 'error') {
            failed = true
          }
        },
      })
    } catch (e) {
      if (e.name !== 'AbortError') failed = true
    } finally {
      setBusy(false)
    }

    if (failed && !answer) {
      answer = "Couldn't reach your sources just now. Try again in a moment."
    }
    updatePopover(id, { body: answer, streaming: false })

    const final = [...history, { role: 'assistant', content: answer }]
    setMessages(final)
    try {
      if (projectId) localStorage.setItem(chatKey(projectId), JSON.stringify(final.slice(-40)))
    } catch {}
  }

  const showStarters = focused && !value && sources.length >= 2

  return (
    <>
      {/* Floating cards sit above the docked bar and below nothing else. */}
      <div className="pointer-events-none fixed bottom-24 right-6 z-40 flex flex-col-reverse items-end gap-3">
        <AnimatePresence>
          {popovers.map(card => <PopoverCard key={card.id} card={card} />)}
        </AnimatePresence>
      </div>

      {/* A floating HUD over Zone A, not a docked row. It can hover the page
          without ever hiding it because Zone A's scroll container reserves
          pb-32 of clearance, so the last line of a draft always scrolls clear
          of the glass. */}
      <div className="absolute inset-x-0 bottom-6 z-30 px-4 flex justify-center pointer-events-none">
        <div className="w-full max-w-[680px] flex flex-col gap-2 pointer-events-auto">

          {/* Palette and quick asks stack above the bar, growing upward so the
              input never shifts under the cursor. */}
          <div className="flex flex-col gap-2">

          {/* Command palette */}
          <AnimatePresence>
            {isCommand && matches.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={SPRING}
                className="glass p-1.5 flex flex-col"
              >
                {matches.map(c => (
                  <button
                    key={c.name}
                    onClick={() => setValue(`/${c.name}${c.arg ? ' ' : ''}`)}
                    className="flex items-center gap-3 px-2.5 py-1.5 rounded-md text-left
                      hover:bg-raised transition-colors"
                  >
                    <span className="font-mono text-[11px] text-brand-500 dark:text-signal shrink-0">
                      /{c.name}{c.arg ? ` ${c.arg}` : ''}
                    </span>
                    <span className="text-[11px] text-t2 truncate">{c.hint}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick asks */}
          <AnimatePresence>
            {showStarters && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={SPRING}
                className="flex flex-wrap justify-center gap-1.5"
              >
                {STARTERS.map(s => (
                  <button
                    key={s.label}
                    onMouseDown={e => { e.preventDefault(); ask(s.prompt) }}
                    className="glass px-3 py-1.5 text-[11px] font-medium text-t2 hover:text-t1
                      rounded-full transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* The bar */}
          <div
            className={`hud flex items-center gap-2.5 px-3.5 py-2.5 transition-all duration-200 ${
              focused ? 'ring-1 ring-brand-500/50' : ''
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              busy ? 'bg-brand-500 dark:bg-signal animate-pulseDot' : 'bg-t3'
            }`} />
            <input
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); ask(value) }
                if (e.key === 'Tab' && isCommand && matches[0]) {
                  e.preventDefault()
                  setValue(`/${matches[0].name}${matches[0].arg ? ' ' : ''}`)
                }
              }}
              placeholder={
                sources.length === 0
                  ? 'Type / for commands…'
                  : `Ask your ${sources.length} source${sources.length === 1 ? '' : 's'}, or type / for commands…`
              }
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-t1
                placeholder:text-t3"
            />
            <kbd className="hidden sm:block font-mono text-[10px] text-t3 border border-line
              rounded px-1.5 py-0.5 shrink-0">⌘K</kbd>
            <button
              onClick={() => ask(value)}
              disabled={!value.trim() || busy}
              className="btn-primary text-xs py-1.5 px-3 shrink-0"
            >
              {busy ? '…' : 'Ask'}
            </button>
          </div>

          <p className="text-center text-[10px] text-t3">
            Grounded in your saved sources. Firmo explains and plans; the writing stays yours.
          </p>
        </div>
      </div>
    </>
  )
}
