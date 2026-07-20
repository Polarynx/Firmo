import { useEffect, useRef, useState } from 'react'
import { streamNDJSON } from '../lib/api'

// Ask your sources: a chat grounded in the project's saved sources. It explains,
// compares, and outlines; the backend hard-refuses to write prose for the paper,
// which is the point — Firmo plans with the student, the writing stays theirs.

const STARTERS = [
  { label: 'Synthesize the evidence', prompt: 'Synthesize what my saved sources say: where they agree, where they disagree, and the overall picture.' },
  { label: 'Where do my sources disagree?', prompt: 'Where do my saved sources disagree or complicate each other? Be specific about which sources are on each side.' },
  { label: 'Outline my paper', prompt: 'Outline my paper from these sources: the main points to make in order, and which sources support each point.' },
  { label: "What's missing?", prompt: 'What is the weakest part of my evidence, and what should I search for next to fix it?' },
]

function chatKey(projectId) {
  return `firmo_chat_${projectId}`
}

function loadChat(projectId) {
  try {
    const raw = JSON.parse(localStorage.getItem(chatKey(projectId)) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function saveChat(projectId, messages) {
  try {
    localStorage.setItem(chatKey(projectId), JSON.stringify(messages.slice(-40)))
  } catch {}
}

export default function SourceChat({ project, sources }) {
  const [messages, setMessages] = useState(() => loadChat(project.id))
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  // Each project keeps its own conversation; switching projects swaps it in.
  useEffect(() => {
    abortRef.current?.abort()
    setMessages(loadChat(project.id))
    setInput('')
    setStreaming(false)
  }, [project.id])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function send(content) {
    const question = content.trim()
    if (!question || streaming) return
    const history = [...messages, { role: 'user', content: question }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)
    abortRef.current = new AbortController()
    let answer = ''
    let failed = false
    try {
      await streamNDJSON('/api/paper-chat', {
        messages: history.slice(-12),
        papers: sources,
        project_name: project.name,
      }, {
        signal: abortRef.current.signal,
        onEvent: ev => {
          if (ev.event === 'delta') {
            answer += ev.text
            setMessages([...history, { role: 'assistant', content: answer }])
          } else if (ev.event === 'error') {
            failed = true
          }
        },
      })
    } catch (e) {
      if (e.name === 'AbortError') return
      failed = true
    } finally {
      setStreaming(false)
    }
    if (failed && !answer) {
      answer = "Couldn't reach your sources just now. Try again in a moment."
    }
    const final = [...history, { role: 'assistant', content: answer }]
    setMessages(final)
    saveChat(project.id, final)
  }

  function clearChat() {
    abortRef.current?.abort()
    setMessages([])
    saveChat(project.id, [])
  }

  return (
    <div className="flex flex-col gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <span className="font-display font-semibold text-sm text-gray-800 dark:text-gray-200">
          Ask your sources
        </span>
        {messages.length > 0 && (
          <button onClick={clearChat} className="text-xs text-gray-400 dark:text-gray-600 hover:text-red-400 font-medium transition-colors">
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed -mt-1">
        A chat grounded in your {sources.length} saved sources. It explains, compares, and
        outlines — the writing stays yours.
      </p>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {STARTERS.map(s => (
            <button
              key={s.label}
              onClick={() => send(s.prompt)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-[2px] border border-gray-200 dark:border-gray-700
                text-gray-600 dark:text-gray-400 hover:border-brand-500 hover:text-brand-700
                dark:hover:border-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div ref={scrollRef} className="flex flex-col gap-2.5 max-h-72 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <p key={i} className="self-end max-w-[85%] rounded-[3px] bg-brand-700 text-white text-xs px-3 py-2 leading-relaxed whitespace-pre-wrap">
                {m.content}
              </p>
            ) : (
              <div key={i} className="self-start max-w-[95%] rounded-[3px] border-l-2 border-l-brand-500 bg-paper-50/70 dark:bg-ink-950/60 px-3 py-2">
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {m.content || (
                    <span className="inline-flex items-center gap-2 text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulseDot" />
                      Reading your sources…
                    </span>
                  )}
                </p>
              </div>
            )
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(input)}
          placeholder="Ask anything about your sources…"
          className="flex-1 min-w-0 rounded-[3px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-ink-900
            text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600
            px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || streaming}
          className="btn-primary text-xs px-3 disabled:opacity-40"
        >
          {streaming ? '…' : 'Ask'}
        </button>
      </div>
    </div>
  )
}
