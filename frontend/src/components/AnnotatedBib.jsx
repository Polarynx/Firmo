import { useState } from 'react'
import { postJSON } from '../lib/api'
import { CITATION_STYLES } from '../lib/constants'

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// One click turns the project's saved sources into the assignment many classes
// literally set: citation + short annotation, tied to the student's thesis.
export default function AnnotatedBib({ sources, style, onClose }) {
  const [thesis, setThesis] = useState('')
  const [entries, setEntries] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const styleLabel = CITATION_STYLES.find(s => s.key === style)?.label || style.toUpperCase()

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const data = await postJSON('/api/annotated-bib', { papers: sources, thesis, style })
      setEntries(data.entries || [])
    } catch {
      setError('Could not build the annotated bibliography. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  function asText() {
    return (entries || [])
      .map(e => e.annotation ? `${e.citation}\n\n    ${e.annotation}` : e.citation)
      .join('\n\n')
  }

  function copyAll() {
    navigator.clipboard.writeText(asText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeInUp"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-ink-900 rounded-[3px] border border-gray-200 dark:border-gray-700 border-t-2 border-t-brand-700 dark:border-t-brand-500 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display font-semibold text-lg text-gray-900 dark:text-gray-100 leading-tight">
              Annotated bibliography
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {sources.length} source{sources.length !== 1 ? 's' : ''} · {styleLabel}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          {!entries && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Each saved source, formatted in {styleLabel} with a 2–3 sentence annotation:
                what it found, why it's credible, and how it serves your paper.
              </p>
              <textarea
                value={thesis}
                onChange={e => setThesis(e.target.value)}
                placeholder="Your thesis or argument (optional — sharpens every annotation)"
                rows={2}
                className="w-full resize-none rounded-[3px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-ink-900
                  text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600
                  px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button onClick={generate} disabled={loading} className="btn-primary text-sm self-start disabled:opacity-40">
                {loading ? 'Reading your sources…' : `Generate for ${sources.length} source${sources.length !== 1 ? 's' : ''}`}
              </button>
              {loading && (
                <div className="flex flex-col gap-2 py-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="skeleton h-3 w-full" />
                      <div className="skeleton h-3 w-5/6 ml-4" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {entries && (
            <div className="flex flex-col gap-4">
              {entries.map(e => (
                <div key={e.id} className="flex flex-col gap-1.5">
                  <p className="bib-entry">{e.citation}</p>
                  {e.annotation && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed pl-5 border-l border-gray-100 dark:border-gray-800 ml-1">
                      {e.annotation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {entries && (
          <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
            <button onClick={copyAll} className="btn-primary text-xs">
              {copied ? '✓ Copied' : 'Copy all'}
            </button>
            <button onClick={() => download('annotated-bibliography.txt', asText())} className="btn-secondary text-xs">
              Download .txt
            </button>
            <button
              onClick={() => { setEntries(null); setError('') }}
              className="text-xs text-gray-400 dark:text-gray-600 hover:text-brand-500 font-medium transition-colors ml-auto"
            >
              Redo with a different thesis
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
