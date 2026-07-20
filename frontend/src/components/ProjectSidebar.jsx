import { useState, useEffect, useRef } from 'react'
import { postJSON } from '../lib/api'
import { paperId } from '../lib/projects'
import { CITATION_STYLES } from '../lib/constants'
import SourceChat from './SourceChat'
import AnnotatedBib from './AnnotatedBib'
import OutlineBuilder from './OutlineBuilder'

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ProjectSidebar({
  projects, activeId, onSelectProject, onCreateProject, onDeleteProject,
  onRemoveSource, citationStyle, onStyleChange, onClose, onFindSources,
}) {
  const active = projects.find(p => p.id === activeId) || null
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [entries, setEntries] = useState([])
  const [bibLoading, setBibLoading] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)
  const [showDownload, setShowDownload] = useState(false)
  const [showAnnotated, setShowAnnotated] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const debounceRef = useRef(null)

  const sources = active?.sources || []
  const sourceKey = sources.map(paperId).join('|')

  // Regenerate the works-cited list whenever sources or style change
  useEffect(() => {
    if (!active || sources.length === 0) {
      setEntries([])
      return
    }
    setBibLoading(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await postJSON('/api/export', { papers: sources, style: citationStyle, format: 'text' })
        setEntries(data.entries || [])
      } catch {
        setEntries([])
      } finally {
        setBibLoading(false)
      }
    }, 400)
    return () => clearTimeout(debounceRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, citationStyle, activeId])

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    onCreateProject(name)
    setNewName('')
    setCreating(false)
  }

  function copyAll() {
    const text = entries.map(e => e.citation).join('\n\n')
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    })
  }

  async function handleDownload(format) {
    setShowDownload(false)
    if (entries.length === 0 && format === 'text') return
    if (format === 'text') {
      download('works-cited.txt', entries.map(e => e.citation).join('\n\n'))
      return
    }
    try {
      const data = await postJSON('/api/export', { papers: sources, style: citationStyle, format })
      download(data.filename, data.content)
    } catch {}
  }

  return (
    <div className="card border-t-2 border-t-gray-900/80 dark:border-t-gray-400/60 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-paper-50 dark:bg-ink-950">
        <span className="font-display font-semibold text-sm text-gray-800 dark:text-gray-200">
          Your paper
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreating(c => !c)}
            className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-500 font-medium transition-colors px-1.5 py-1"
            title="New project"
          >
            + New
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 lg:hidden" aria-label="Close panel">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Create form */}
        {creating && (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. PSYC100 sleep essay"
              className="flex-1 rounded-[3px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-ink-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
            <button onClick={handleCreate} disabled={!newName.trim()} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40">
              Create
            </button>
          </div>
        )}

        {/* No projects yet */}
        {projects.length === 0 && !creating && (
          <div className="flex flex-col gap-2 text-center py-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No project yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              Create one for the paper you're writing. Every source you save lands here and your
              works-cited page builds itself.
            </p>
            <button onClick={() => setCreating(true)} className="btn-primary text-xs self-center mt-1">
              Start a project
            </button>
          </div>
        )}

        {/* Project switcher */}
        {projects.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={activeId || ''}
              onChange={e => onSelectProject(e.target.value)}
              className="flex-1 text-xs font-medium px-2 py-1.5 rounded-[3px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-ink-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/50 cursor-pointer"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sources.length})</option>
              ))}
            </select>
            {active && (
              <button
                onClick={() => {
                  if (window.confirm(`Delete "${active.name}" and its ${sources.length} saved sources?`)) {
                    onDeleteProject(active.id)
                  }
                }}
                className="p-1.5 text-gray-300 dark:text-gray-700 hover:text-red-400 transition-colors"
                title="Delete project"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Empty project: guide */}
        {active && sources.length === 0 && (
          <div className="rounded-[3px] border border-dashed border-gray-200 dark:border-gray-700 px-3 py-4 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              Save sources with the bookmark on any result.<br />
              Aim for 5+ before you start writing.
            </p>
          </div>
        )}

        {/* Sources list */}
        {sources.length > 0 && (
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            <span className="eyebrow">
              {sources.length} source{sources.length === 1 ? '' : 's'}
            </span>
            {sources.map(s => (
              <div key={paperId(s)} className="group flex items-start gap-2 text-xs">
                <span className="text-gray-300 dark:text-gray-700 mt-0.5 shrink-0">·</span>
                <a
                  href={s.url || (s.doi ? `https://doi.org/${s.doi}` : undefined)}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 leading-snug transition-colors line-clamp-2"
                >
                  {s.title}{s.year ? ` (${s.year})` : ''}
                </a>
                <button
                  onClick={() => onRemoveSource(s)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-700 hover:text-red-400 transition-all shrink-0"
                  title="Remove"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Ask your sources: chat grounded in the saved sources, once there are
            enough to talk about. Explains and outlines; never writes their prose. */}
        {active && sources.length >= 2 && (
          <SourceChat project={active} sources={sources} />
        )}

        {/* Works cited */}
        {sources.length > 0 && (
          <div className="flex flex-col gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-sm text-gray-800 dark:text-gray-200">
                Works cited
              </span>
              <div className="relative">
                <button
                  onClick={() => setShowDownload(s => !s)}
                  className="text-xs text-gray-400 dark:text-gray-600 hover:text-brand-500 font-medium transition-colors"
                >
                  Download ▾
                </button>
                {showDownload && (
                  <div className="absolute right-0 top-6 z-20 card p-1 flex flex-col min-w-[140px] shadow-lg">
                    <button onClick={() => handleDownload('text')} className="text-left text-xs px-2.5 py-1.5 rounded hover:bg-paper-100 dark:hover:bg-ink-800 text-gray-600 dark:text-gray-400">Text (.txt)</button>
                    <button onClick={() => handleDownload('bibtex')} className="text-left text-xs px-2.5 py-1.5 rounded hover:bg-paper-100 dark:hover:bg-ink-800 text-gray-600 dark:text-gray-400">BibTeX (.bib)</button>
                    <button onClick={() => handleDownload('ris')} className="text-left text-xs px-2.5 py-1.5 rounded hover:bg-paper-100 dark:hover:bg-ink-800 text-gray-600 dark:text-gray-400">RIS for Zotero (.ris)</button>
                  </div>
                )}
              </div>
            </div>

            {/* Style tabs */}
            <div className="flex flex-wrap gap-1">
              {CITATION_STYLES.map(s => (
                <button
                  key={s.key}
                  onClick={() => onStyleChange(s.key)}
                  className={`text-[10px] font-medium px-2 py-1 rounded-[2px] transition-colors ${
                    citationStyle === s.key
                      ? 'bg-brand-700 text-white'
                      : 'bg-paper-100 dark:bg-ink-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* The page itself */}
            <div className="rounded-[3px] bg-paper-50 dark:bg-ink-950 border border-paper-200 dark:border-gray-800 px-3.5 py-3 flex flex-col gap-2.5 max-h-72 overflow-y-auto">
              {bibLoading ? (
                <div className="flex flex-col gap-2 py-1">
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-5/6" />
                  <div className="skeleton h-3 w-full" />
                </div>
              ) : entries.length > 0 ? (
                entries.map(e => (
                  <p key={e.id} className="bib-entry">{e.citation}</p>
                ))
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-600">Citations will appear here.</p>
              )}
            </div>

            <button onClick={copyAll} disabled={bibLoading || entries.length === 0} className="btn-primary text-xs disabled:opacity-40">
              {copiedAll ? '✓ Copied, paste into your paper' : `Copy all ${entries.length} citations`}
            </button>
            <div className="flex gap-2">
              <button onClick={() => setShowAnnotated(true)} className="btn-secondary text-xs flex-1">
                Annotated bibliography
              </button>
              <button onClick={() => setShowOutline(true)} className="btn-secondary text-xs flex-1">
                Outline builder
              </button>
            </div>
          </div>
        )}
      </div>

      {showAnnotated && sources.length > 0 && (
        <AnnotatedBib sources={sources} style={citationStyle} onClose={() => setShowAnnotated(false)} />
      )}
      {showOutline && sources.length > 0 && (
        <OutlineBuilder
          sources={sources}
          onClose={() => setShowOutline(false)}
          onFindSources={q => { setShowOutline(false); onFindSources?.(q) }}
        />
      )}
    </div>
  )
}
