import { useState } from 'react'
import { postJSON } from '../lib/api'

// From saved sources to a plan: every point names the sources that back it, and
// points with no evidence get a one-click search to go fill the gap.
export default function OutlineBuilder({ sources, onClose, onFindSources }) {
  const [thesis, setThesis] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await postJSON('/api/outline', { papers: sources, thesis })
      setData(res)
    } catch {
      setError('Could not build the outline. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  function asText() {
    if (!data) return ''
    return data.sections.map((s, i) => {
      const pts = s.points.map(p => {
        const refs = p.sources.length > 0 ? ` [${p.sources.map(r => r.label).join('; ')}]` : ''
        const gap = p.gap_query ? ' [needs a source]' : ''
        return `  - ${p.point}${refs}${gap}`
      }).join('\n')
      return `${i + 1}. ${s.title}\n${pts}`
    }).join('\n\n')
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
              Outline builder
            </h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Built from your {sources.length} saved source{sources.length !== 1 ? 's' : ''} · a plan, not prose
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          {!data && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                A point-by-point plan for your paper where every point lists the saved sources that
                back it, and any point without evidence gets a ready-made search to fix that.
              </p>
              <textarea
                value={thesis}
                onChange={e => setThesis(e.target.value)}
                placeholder="Your thesis or argument (optional — shapes the whole outline)"
                rows={2}
                className="w-full resize-none rounded-[3px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-ink-900
                  text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600
                  px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <button onClick={generate} disabled={loading} className="btn-primary text-sm self-start disabled:opacity-40">
                {loading ? 'Planning from your sources…' : 'Build outline'}
              </button>
              {loading && (
                <div className="flex flex-col gap-2 py-1">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="skeleton h-3.5 w-40" />
                      <div className="skeleton h-3 w-full ml-4" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {data && (
            <div className="flex flex-col gap-4">
              {data.sections.map((s, si) => (
                <div key={si} className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-2.5 border-t-2 border-gray-900/80 dark:border-gray-400/60 pt-2.5">
                    <span className="font-mono text-[10px] font-medium tracking-[0.18em] text-brand-700 dark:text-brand-400">
                      {String(si + 1).padStart(2, '0')}
                    </span>
                    <h3 className="font-display font-semibold text-[15px] text-gray-900 dark:text-gray-100">{s.title}</h3>
                  </div>
                  {s.points.map((p, pi) => (
                    <div key={pi} className="flex flex-col gap-1.5 pl-6">
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{p.point}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.sources.map((r, ri) => (
                          <span
                            key={ri}
                            title={r.title}
                            className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-[2px] border border-brand-400/60 text-brand-700 dark:text-brand-300 dark:border-brand-700"
                          >
                            {r.label}
                          </span>
                        ))}
                        {p.gap_query && (
                          <button
                            onClick={() => { onFindSources(p.gap_query); onClose() }}
                            className="inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] px-2 py-0.5 rounded-[2px] border border-amber-400/60 text-amber-700 dark:text-amber-300 dark:border-amber-800 hover:border-amber-500 transition-colors"
                            title={`Search: ${p.gap_query}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            No source yet · find some
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {data && (
          <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
            <button onClick={copyAll} className="btn-primary text-xs">
              {copied ? '✓ Copied' : 'Copy outline'}
            </button>
            <button
              onClick={() => { setData(null); setError('') }}
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
