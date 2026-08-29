import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { cannedAsk, fakeLatency, isDemoActive } from '../../lib/demoMode'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSavedSources } from '../../stores/selectors'
import { useResearchStore } from '../../stores/useResearchStore'
import { useAnnotationStore } from '../../stores/useAnnotationStore'
import { useRecordStore } from '../../stores/useRecordStore'
import { streamNDJSON } from '../../lib/api'
import { runIntent } from '../../lib/runIntent'
import { SPRING } from '../../lib/constants'
import { Keycap, LED } from '../ui/primitives'
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

function chatKey(id) { return `firmo_chat_${id}` }

// Whether this person has ever asked Firmo anything.
//
// The chat is the one part of the product that knows the whole project at once
// — every saved source, the question, the outline and the draft — and it was
// the part nobody found. It only offered its examples once the bar already had
// focus, which asks the reader to click a box before it will say what the box
// is for. A student who reads it as a search field never clicks, and never
// learns the difference.
//
// So the examples show themselves once, unprompted, at the moment they first
// mean anything: when there are a couple of saved sources for them to work on.
// After the first question they go back to appearing on focus only, because by
// then the person knows, and a hint that will not stop hinting is clutter.
const ASKED_KEY = 'firmo_has_asked'

function hasAskedBefore() {
  try { return localStorage.getItem(ASKED_KEY) === '1' } catch { return true }
}

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

  const doc = useWorkspaceStore(s => s.doc)
  const projectId = useWorkspaceStore(s => s.activeProjectId)
  const logRecord = useRecordStore(s => s.log)
  const projectName = useWorkspaceStore(s => s.projects.find(p => p.id === s.activeProjectId)?.name || '')
  const sources = useSavedSources()

  const executeSearch = useResearchStore(s => s.executeSearch)

  const [messages, setMessages] = useState(() => (projectId ? loadChat(projectId) : []))
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const [knowsChat, setKnowsChat] = useState(hasAskedBefore)
  // The demo drives this same bar and has its own beat for the chat. A hint
  // volunteering itself over the top of a scripted walkthrough is two things
  // talking at once. Read from the store rather than isDemoActive(), which is a
  // module flag and would not re-render this when the demo starts or ends.
  const demoRunning = useUIStore(s => s.showWalkthrough)
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

  async function ask(question) {
    const q = question.trim()
    if (!q || busy) return

    // They have found it. Stop volunteering the examples.
    //
    // Not for the demo's own scripted question, which runs through this same
    // function: someone who watched the walkthrough and never typed anything
    // has not found the chat, and spending their one first-run hint on a beat
    // they only watched would be exactly backwards.
    if (!knowsChat && !isDemoActive()) {
      setKnowsChat(true)
      try { localStorage.setItem(ASKED_KEY, '1') } catch {}
    }

    if (sources.length === 0) {
      pushPopover({
        title: q,
        body: 'Save a couple of sources first. This chat only answers from the sources in your project, so it has nothing to read yet.',
      })
      setValue('')
      return
    }

    // A walkthrough answers from its own script rather than the model, so the
    // beat cannot fail, cost a request, or depend on what the viewer has saved.
    if (isDemoActive()) {
      const id = pushPopover({ title: q, streaming: true })
      setValue('')
      const answer = cannedAsk()
      // Typed out rather than dropped in whole: the streaming answer is the
      // thing being demonstrated, and a block of text appearing at once is not
      // a demonstration of it.
      for (let i = 0; i <= answer.length; i += 3) {
        await fakeLatency(14)
        updatePopover(id, { body: answer.slice(0, i), streaming: true })
      }
      updatePopover(id, { body: answer, streaming: false })
      return
    }

    const history = [...messages, { role: 'user', content: q }]
    const id = pushPopover({ title: q, streaming: true })
    setValue('')
    setBusy(true)
    abortRef.current = new AbortController()

    let answer = ''
    let failed = false
    let declined = false
    try {
      await streamNDJSON('/api/paper-chat', {
        messages: history.slice(-12),
        papers: sources,
        project_name: projectName,
        // The rest of the paper goes with the question. Without these the chat
        // could only answer "what do my sources say"; with them it can answer
        // "does this section work", "what is this paragraph missing", "how do I
        // say this more plainly" — the questions someone actually has with a
        // half-written draft open.
        question: useResearchStore.getState().searchedQuery || '',
        outline: useAnnotationStore.getState().outline || [],
        draft: useWorkspaceStore.getState().doc || '',
      }, {
        signal: abortRef.current.signal,
        onEvent: ev => {
          if (ev.event === 'delta') {
            answer += ev.text
            updatePopover(id, { body: answer })
          } else if (ev.event === 'declined') {
            // Firmo said no to writing prose. The server reports it; the client
            // never infers it from the question.
            declined = true
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

    if (!failed && answer) {
      logRecord(
        useWorkspaceStore.getState().ensureProject(),
        declined ? 'chat.refusal' : 'chat.turn',
        { asked: q.slice(0, 300) },
      )
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

  // Focus shows them always; the first-run nudge shows them without it.
  const showStarters = !value && sources.length >= 2
    && (focused || (!knowsChat && !demoRunning))

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

          {/* Quick asks */}
          <AnimatePresence>
            {showStarters && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={SPRING}
                className="flex flex-col items-center gap-1.5"
              >
                {/* Only the first time. Once they have asked something, the
                    pills are a shortcut and no longer need introducing. */}
                {!knowsChat && (
                  <p className="text-[11px] text-t2">
                    Firmo can read all {sources.length} of your sources at once. Try:
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-1.5">
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* The dock. It hangs over the document rather than sitting on the
              viewport edge, and lights its own border on focus. */}
          <div className="dock flex items-center gap-2.5 pl-3.5 pr-2 py-2">
            <span className="shrink-0 pl-0.5">
              <LED live={busy} />
            </span>
            <input
              data-demo="ask-box"
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); ask(value) }
              }}
              placeholder={
                sources.length === 0
                  ? 'Ask Firmo about your paper…'
                  : `Ask about your ${sources.length} source${sources.length === 1 ? '' : 's'}, outline or draft…`
              }
              className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none
                text-[13px] text-t1 placeholder:text-t3"
            />
            {!value && (
              <span className="hidden sm:flex items-center gap-1 shrink-0" aria-hidden="true">
                <Keycap>⌘</Keycap>
                <Keycap>K</Keycap>
              </span>
            )}
            <button
              onClick={() => ask(value)}
              disabled={!value.trim() || busy}
              className="btn-primary text-xs py-1.5 px-3 shrink-0 flex items-center gap-2"
            >
              {busy ? 'Asking…' : 'Ask'}
              {!busy && value.trim() && (
                <span className="font-mono text-[10px] opacity-60">↵</span>
              )}
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
