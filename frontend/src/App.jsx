import { useState, useEffect, useRef } from 'react'

import ResearchInput from './components/ResearchInput'
import BriefCard from './components/BriefCard'
import PaperCard from './components/PaperCard'
import HeroEmblem from './components/HeroEmblem'
import ProjectSidebar from './components/ProjectSidebar'
import EssayChecker from './components/EssayChecker'
import CitationChecker from './components/CitationChecker'
import ThemeToggle from './components/ThemeToggle'
import Walkthrough from './components/Walkthrough'
import Changelog from './components/Changelog'

import { postJSON, streamResearch, streamNDJSON } from './lib/api'
import { loadStore, saveStore, newProject, paperId } from './lib/projects'
import { SOURCE_LABELS, STANCE } from './lib/constants'

function saveToHistory(query, response) {
  try {
    const history = JSON.parse(localStorage.getItem('firmo_history') || '[]')
    const entry = { claim: query, response, timestamp: Date.now() }
    const deduped = history.filter(h => h.claim.toLowerCase() !== query.toLowerCase())
    localStorage.setItem('firmo_history', JSON.stringify([entry, ...deduped].slice(0, 20)))
  } catch {}
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('firmo_history') || '[]')
  } catch {
    return []
  }
}

function SkeletonCard() {
  return (
    <div className="source-card opacity-60">
      <div className="flex items-start justify-between gap-3">
        <div className="skeleton h-4 flex-1" />
        <div className="skeleton h-4 w-10" />
      </div>
      <div className="skeleton h-3 w-36" />
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
        <div className="skeleton h-3 w-4/6" />
      </div>
    </div>
  )
}

const IDLE_STEPS = [
  { n: '1', title: 'Describe your paper', body: 'A topic, a thesis, or a research question. Firmo figures out which and maps the field for you.' },
  { n: '2', title: 'Collect real sources', body: '15 academic databases searched at once, ranked for relevance, tagged by whether they support or challenge your argument.' },
  { n: '3', title: 'Copy your bibliography', body: 'Save sources to your project and your works-cited page writes itself in APA, MLA, Chicago, Harvard, or IEEE.' },
]

export default function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [view, setView] = useState('research') // 'research' | 'essay' | 'cites'

  // research state
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [yearFrom, setYearFrom] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [statusMsg, setStatusMsg] = useState('')
  const [brief, setBrief] = useState(null)
  const [inputType, setInputType] = useState('topic') // topic | thesis | question
  const [results, setResults] = useState([])
  const [provisional, setProvisional] = useState(false)
  const [stanceCounts, setStanceCounts] = useState(null)
  const [error, setError] = useState('')
  const [stanceFilter, setStanceFilter] = useState(null)
  const [showRelated, setShowRelated] = useState(false)
  const [hiddenSources, setHiddenSources] = useState(new Set())
  const [moreLoading, setMoreLoading] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
  const [askAnswer, setAskAnswer] = useState(null)
  const [asking, setAsking] = useState(false)
  const abortRef = useRef(null)

  // citation style, persisted across sessions
  const [style, setStyle] = useState(() => localStorage.getItem('firmo_style') || 'apa')
  useEffect(() => { localStorage.setItem('firmo_style', style) }, [style])

  // projects
  const [store, setStore] = useState(loadStore)
  const activeProject = store.projects.find(p => p.id === store.activeId) || null
  const savedIds = new Set((activeProject?.sources || []).map(paperId))
  const [showSidebar, setShowSidebar] = useState(false) // mobile drawer

  // header panels
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState(loadHistory)
  const [showWalkthrough, setShowWalkthrough] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)

  // draft coach state
  const [essayText, setEssayText] = useState('')
  const [draftClaims, setDraftClaims] = useState(null) // null until a check runs
  const [draftTypos, setDraftTypos] = useState(null)
  const [draftMeta, setDraftMeta] = useState(null) // { truncated, checkedChars, totalFound }
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftStatus, setDraftStatus] = useState('')
  const [draftError, setDraftError] = useState('')
  const draftAbortRef = useRef(null)

  // citation checker state
  const [citeText, setCiteText] = useState('')
  const [citeItems, setCiteItems] = useState(null) // null until a check runs
  const [citeLoading, setCiteLoading] = useState(false)
  const [citeStatus, setCiteStatus] = useState('')
  const [citeError, setCiteError] = useState('')
  const citeAbortRef = useRef(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q')
    if (q) {
      setQuery(q)
      runResearch(q)
    }
    window.history.replaceState({}, '', window.location.pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function updateStore(fn) {
    setStore(prev => {
      const next = fn(prev)
      saveStore(next)
      return next
    })
  }

  async function runResearch(overrideQuery) {
    const activeQuery = (overrideQuery ?? query).trim()
    if (!activeQuery) return

    setView('research')
    setPhase('running')
    setError('')
    setStatusMsg('Reading your topic…')
    setBrief(null)
    setInputType('topic')
    setResults([])
    setProvisional(false)
    setStanceCounts(null)
    setStanceFilter(null)
    setShowRelated(false)
    setHiddenSources(new Set())
    setAskAnswer(null)
    setAskQuestion('')
    setShowHistory(false)
    setSearchedQuery(activeQuery)

    window.history.pushState({}, '', '?q=' + encodeURIComponent(activeQuery))

    abortRef.current = new AbortController()
    let briefText = ''
    let invalid = false

    try {
      await streamResearch(
        { query: activeQuery, year_from: yearFrom },
        {
          signal: abortRef.current.signal,
          onEvent: ev => {
            switch (ev.event) {
              case 'status':
                setStatusMsg(ev.message)
                break
              case 'brief': {
                const corrected = ev.corrected_input || activeQuery
                briefText = ev.brief || ''
                setBrief(ev)
                setInputType(ev.input_type || 'topic')
                setSearchedQuery(corrected)
                if (corrected !== activeQuery) {
                  setQuery(corrected)
                  window.history.replaceState({}, '', '?q=' + encodeURIComponent(corrected))
                }
                break
              }
              case 'papers':
                setResults(ev.results || [])
                setProvisional(true)
                break
              case 'ranked':
                setResults(ev.results || [])
                setProvisional(false)
                setStanceCounts(ev.stance_counts || null)
                break
              case 'invalid':
                invalid = true
                setError('invalid_query')
                break
              case 'error':
                setError(ev.message || 'Something went wrong.')
                break
              default:
                break
            }
          },
        }
      )
      if (!invalid && briefText) {
        saveToHistory(activeQuery, briefText)
        setHistory(loadHistory())
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Something went wrong. Is the backend running?')
      }
    } finally {
      setPhase('done')
      abortRef.current = null
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    setPhase('idle')
  }

  function handleToggleSave(paper) {
    updateStore(prev => {
      let projects = prev.projects
      let activeId = prev.activeId
      if (projects.length === 0) {
        const p = newProject('My paper')
        projects = [p]
        activeId = p.id
      }
      if (!activeId || !projects.some(p => p.id === activeId)) {
        activeId = projects[0].id
      }
      const id = paperId(paper)
      projects = projects.map(p => {
        if (p.id !== activeId) return p
        const exists = p.sources.some(s => paperId(s) === id)
        const sources = exists
          ? p.sources.filter(s => paperId(s) !== id)
          : [{ ...paper, savedAt: Date.now(), savedQuery: searchedQuery }, ...p.sources]
        return { ...p, sources }
      })
      return { projects, activeId }
    })
  }

  async function handleFindMore() {
    setMoreLoading(true)
    const seenIds = results.map(paperId).filter(Boolean)
    try {
      const data = await postJSON('/api/more-sources', {
        claim: searchedQuery, year_from: yearFrom, seen_ids: seenIds,
      })
      setResults(prev => [...prev, ...(data.results || [])])
    } catch {}
    finally { setMoreLoading(false) }
  }

  async function handleAsk() {
    if (!askQuestion.trim() || asking) return
    setAsking(true)
    setAskAnswer(null)
    try {
      const data = await postJSON('/api/ask-sources', {
        question: askQuestion, claim: searchedQuery, papers: results,
      })
      setAskAnswer(data.answer)
    } catch {
      setAskAnswer('Could not answer.')
    } finally { setAsking(false) }
  }

  async function handleDraftCheck(text) {
    if (!text.trim()) return
    setDraftLoading(true)
    setDraftError('')
    setDraftClaims(null)
    setDraftTypos(null)
    setDraftMeta(null)
    setDraftStatus('Reading your draft…')
    draftAbortRef.current = new AbortController()
    try {
      await streamNDJSON('/api/draft-check', {
        text,
        saved_papers: activeProject?.sources || [],
      }, {
        signal: draftAbortRef.current.signal,
        onEvent: ev => {
          switch (ev.event) {
            case 'status':
              setDraftStatus(ev.message)
              break
            case 'claims':
              setDraftClaims(ev.items || [])
              setDraftMeta({ truncated: ev.truncated, checkedChars: ev.checked_chars, totalFound: ev.total_found })
              break
            case 'typos':
              setDraftTypos(ev.items || [])
              break
            case 'verdict': {
              const { event: _e, ...patch } = ev
              setDraftClaims(prev => (prev || []).map(c => (c.id === patch.id ? { ...c, ...patch } : c)))
              break
            }
            case 'error':
              setDraftError(ev.message || 'Something went wrong.')
              break
            default:
              break
          }
        },
      })
    } catch (e) {
      if (e.name !== 'AbortError') setDraftError(e.message || 'Something went wrong. Is the backend running?')
    } finally {
      setDraftLoading(false)
      draftAbortRef.current = null
    }
  }

  function updateDraftClaim(id, patch) {
    setDraftClaims(prev => (prev || []).map(c => (c.id === id ? { ...c, ...patch } : c)))
  }

  async function handleCheckCitations(text) {
    if (!text.trim()) return
    setCiteLoading(true)
    setCiteError('')
    setCiteItems(null)
    setCiteStatus('Reading your reference list…')
    citeAbortRef.current = new AbortController()
    try {
      await streamNDJSON('/api/check-citations', { text }, {
        signal: citeAbortRef.current.signal,
        onEvent: ev => {
          switch (ev.event) {
            case 'status':
              setCiteStatus(ev.message)
              break
            case 'entries':
              setCiteItems((ev.items || []).map(it => ({ ...it, verdict: 'checking' })))
              break
            case 'result': {
              const { event: _e, index, ...patch } = ev
              setCiteItems(prev => (prev || []).map((c, i) => (i === index ? { ...c, ...patch } : c)))
              break
            }
            case 'error':
              setCiteError(ev.message || 'Something went wrong.')
              break
            default:
              break
          }
        },
      })
    } catch (e) {
      if (e.name !== 'AbortError') setCiteError(e.message || 'Something went wrong. Is the backend running?')
    } finally {
      setCiteLoading(false)
      citeAbortRef.current = null
    }
  }

  // filters
  const filteredResults = results.filter(p => {
    if (stanceFilter && p.stance !== stanceFilter) return false
    if (hiddenSources.size > 0 && hiddenSources.has(p.source)) return false
    return true
  })

  // Two tiers: sources directly about the topic ("Relevant", shown by default) vs.
  // sources tied to it but broader ("Related & background", revealed on request).
  // Provisional preview papers carry no tier yet, so they all read as relevant.
  const coreResults = filteredResults.filter(p => p.tier !== 'related')
  const relatedResults = filteredResults.filter(p => p.tier === 'related')
  // if nothing is squarely on-topic, don't hide everything behind a button
  const relatedOpen = showRelated || coreResults.length === 0

  const sourceCounts = results.reduce((acc, p) => {
    if (p.source) acc[p.source] = (acc[p.source] || 0) + 1
    return acc
  }, {})

  function toggleSource(src) {
    setHiddenSources(prev => {
      const next = new Set(prev)
      next.has(src) ? next.delete(src) : next.add(src)
      return next
    })
  }

  const running = phase === 'running'
  const showResults = view === 'research' && (running || phase === 'done')
  const bibCount = activeProject?.sources.length || 0
  // A plain topic has no sides to take, so every source is simply background and the
  // stance chips carry no information. Only an argument (thesis/question) earns them.
  const isArgument = inputType === 'thesis' || inputType === 'question'

  return (
    <div className="min-h-screen bg-paper-50 dark:bg-ink-950 text-gray-900 dark:text-gray-100 transition-colors duration-200">

      {/* Masthead */}
      <header className="bg-paper-50/90 dark:bg-ink-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <button
              onClick={() => { setView('research'); setPhase('idle'); setError(''); window.history.replaceState({}, '', window.location.pathname) }}
              className="wordmark font-display font-bold text-2xl tracking-tight text-gray-900 dark:text-gray-100"
            >
              Firmo
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowHistory(h => !h)}
              className="p-2 rounded-[3px] text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors relative"
              aria-label="Search history"
              title="Search history"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {history.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setShowWalkthrough(true)}
              className="p-2 rounded-[3px] text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
              aria-label="How to use Firmo"
              title="How to use Firmo"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </button>
            <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
          </div>
        </div>

        {/* journal-masthead double rule */}
        <div className="max-w-6xl mx-auto px-4">
          <div className="rule-double text-gray-900/80 dark:text-gray-400/60" />
        </div>

        {showHistory && (
          <div className="max-w-6xl mx-auto px-4 pb-3 animate-fadeInUp">
            <div className="card overflow-hidden max-w-2xl">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs text-gray-400 dark:text-gray-500">Recent searches</span>
                {history.length > 0 && (
                  <button
                    onClick={() => { localStorage.removeItem('firmo_history'); setHistory([]) }}
                    className="text-xs text-red-400 hover:text-red-500 transition-colors"
                  >Clear</button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">No history yet.</p>
              ) : (
                <ul>
                  {history.map((entry, i) => (
                    <li key={i}>
                      <button
                        onClick={() => { setShowHistory(false); setQuery(entry.claim); runResearch(entry.claim) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-paper-100 dark:hover:bg-ink-800/60 transition-colors flex flex-col gap-0.5"
                      >
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{entry.claim}</span>
                        <span className="text-xs text-gray-400 truncate">{entry.response?.slice(0, 80)}…</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-10 pb-24 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">

        {/* ── Left column: research ── */}
        <div className="flex flex-col gap-8 min-w-0">

          {/* Hero: shown above whichever tool is open, until its results take over.
              `isolate` scopes the hero's internal z-index so it can never paint over
              the sticky masthead when the page scrolls underneath it. */}
          {((view === 'research' && phase === 'idle') || (view === 'essay' && !draftClaims) || (view === 'cites' && !citeItems)) && (
            <div className="relative pt-6 isolate">
              <div className="hero-atmos" aria-hidden="true" />
              <div className="hero-seq relative z-10 flex flex-col gap-3.5">
                <span className="eyebrow hero-kicker !text-brand-700 dark:!text-brand-400">
                  {view === 'research' ? "For every paper you'll ever write"
                    : view === 'essay' ? 'Before you hand it in'
                    : 'The last check before you submit'}
                </span>
                <h1 className="font-display font-semibold text-[2.75rem] sm:text-6xl tracking-[-0.02em] leading-[1.03]">
                  {view === 'essay' ? (
                    <>Every claim,<br /><span className="hero-word italic text-brand-700 dark:text-brand-400">backed</span>.</>
                  ) : view === 'cites' ? (
                    <>Every citation,<br /><span className="hero-word italic text-brand-700 dark:text-brand-400">real</span>.</>
                  ) : (
                    <>From blank page<br />to <span className="hero-word italic text-brand-700 dark:text-brand-400">bibliography</span>.</>
                  )}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-[15px] max-w-lg mt-1 leading-relaxed">
                  {view === 'essay'
                    ? 'Paste your draft and Firmo highlights every claim that needs backing, right in your text, with real sources ready to cite in one click.'
                    : view === 'cites'
                    ? 'Paste your finished reference list. Firmo checks every entry against publisher records and flags typos, wrong years, retracted papers, and citations that don\'t exist.'
                    : 'Tell Firmo what you\'re writing about. It finds real, citable academic sources, shows you what the evidence says, and builds your works-cited page as you go.'}
                </p>
              </div>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex flex-col gap-3">
            <div className="flex rounded-[3px] overflow-hidden border border-gray-300 dark:border-gray-700 self-start text-xs font-medium">
              <button
                onClick={() => setView('research')}
                className={`px-3.5 py-1.5 transition-colors ${view === 'research' ? 'bg-brand-700 text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-paper-100 dark:hover:bg-ink-800'}`}
              >
                Find sources
              </button>
              <button
                onClick={() => setView('essay')}
                className={`px-3.5 py-1.5 transition-colors ${view === 'essay' ? 'bg-brand-700 text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-paper-100 dark:hover:bg-ink-800'}`}
              >
                Check my draft
              </button>
              <button
                onClick={() => setView('cites')}
                className={`px-3.5 py-1.5 transition-colors ${view === 'cites' ? 'bg-brand-700 text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-paper-100 dark:hover:bg-ink-800'}`}
              >
                Check citations
              </button>
            </div>

            {view === 'research' ? (
              <ResearchInput
                query={query}
                onQueryChange={setQuery}
                yearFrom={yearFrom}
                onYearFromChange={setYearFrom}
                onSearch={() => runResearch()}
                onCancel={handleCancel}
                loading={running}
              />
            ) : view === 'cites' ? (
              <CitationChecker
                text={citeText}
                onTextChange={setCiteText}
                items={citeItems}
                loading={citeLoading}
                error={citeError}
                statusMsg={citeStatus}
                onCheck={handleCheckCitations}
                onCancel={() => { citeAbortRef.current?.abort(); setCiteLoading(false) }}
              />
            ) : (
              <EssayChecker
                text={essayText}
                onTextChange={setEssayText}
                claims={draftClaims}
                typos={draftTypos}
                meta={draftMeta}
                loading={draftLoading}
                error={draftError}
                statusMsg={draftStatus}
                onCheck={handleDraftCheck}
                onCancel={() => { draftAbortRef.current?.abort(); setDraftLoading(false) }}
                onUpdateClaim={updateDraftClaim}
                onClearResults={() => { setDraftClaims(null); setDraftTypos(null); setDraftMeta(null); setDraftError('') }}
                onDismissTypos={() => setDraftTypos(null)}
                citationStyle={style}
                savedIds={savedIds}
                onToggleSave={handleToggleSave}
                onFindSources={q => { setQuery(q); runResearch(q) }}
              />
            )}
          </div>

          {/* Idle: how it works */}
          {phase === 'idle' && view === 'research' && (
            <div className="grid sm:grid-cols-3 gap-3">
              {IDLE_STEPS.map(s => (
                <div key={s.n} className="border-t-2 border-gray-900/80 dark:border-gray-400/60 pt-3 flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] font-medium tracking-[0.18em] text-brand-700 dark:text-brand-400">0{s.n}</span>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{s.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {showResults && (
            <div className="flex flex-col gap-5">

              {/* Streaming status */}
              {running && (
                <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400 animate-fadeInUp" aria-live="polite">
                  <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulseDot shrink-0" />
                  {statusMsg}
                </div>
              )}

              {/* Errors */}
              {error === 'invalid_query' ? (
                <div className="rounded-[3px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 p-5 flex flex-col gap-1.5 animate-fadeInUp">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Firmo needs a research subject</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Try a topic ("microplastics in drinking water"), a thesis ("school uniforms improve focus"),
                    or a question ("does remote work reduce productivity?").
                  </p>
                </div>
              ) : error ? (
                <div className="rounded-[3px] border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-300 text-sm">
                  {error}
                </div>
              ) : null}

              {/* Brief */}
              {brief && !error && (
                <BriefCard brief={brief} onExplore={r => { setQuery(r); runResearch(r) }} />
              )}
              {running && !brief && (
                <div className="card p-5 flex flex-col gap-2">
                  <div className="skeleton h-3 w-24" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-5/6" />
                </div>
              )}

              {/* Papers */}
              {results.length === 0 && running && brief && (
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
                </div>
              )}

              {results.length === 0 && phase === 'done' && brief && !error && (
                <p className="text-gray-400 dark:text-gray-600 text-sm py-4">
                  No directly relevant sources found. Try rewording, or explore one of the related topics above.
                </p>
              )}

              {results.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="eyebrow">
                      {provisional
                        ? 'First results, still ranking…'
                        : `${coreResults.length} relevant ${coreResults.length === 1 ? 'source' : 'sources'} · ranked by relevance`}
                      {(stanceFilter || hiddenSources.size > 0) && <span className="ml-1 !text-brand-600 dark:!text-brand-400">· {filteredResults.length} shown</span>}
                    </p>
                  </div>

                  {/* Stance filter: only when the query is an argument with real sides */}
                  {stanceCounts && isArgument && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {Object.entries(STANCE).map(([key, cfg]) => {
                        const count = stanceCounts[key] || 0
                        if (count === 0) return null
                        const active = stanceFilter === key
                        return (
                          <button
                            key={key}
                            onClick={() => setStanceFilter(active ? null : key)}
                            className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-1 rounded-[2px] border transition-all ${
                              active ? cfg.chip + ' ring-1 ring-current' : cfg.chip + ' opacity-70 hover:opacity-100'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                            <span className="opacity-60">{count}</span>
                          </button>
                        )
                      })}
                      {stanceFilter && (
                        <button onClick={() => setStanceFilter(null)} className="text-[11px] text-brand-500 hover:text-brand-600 font-medium">
                          Show all
                        </button>
                      )}
                    </div>
                  )}

                  {/* Database filter */}
                  {Object.keys(sourceCounts).length > 1 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="eyebrow shrink-0">Databases</span>
                      {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, count]) => {
                        const hidden = hiddenSources.has(src)
                        return (
                          <button
                            key={src}
                            onClick={() => toggleSource(src)}
                            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-[2px] border transition-all ${
                              hidden
                                ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-700 line-through'
                                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-brand-500 dark:hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-400'
                            }`}
                          >
                            {SOURCE_LABELS[src] || src}
                            <span className="opacity-60">{count}</span>
                          </button>
                        )
                      })}
                      {hiddenSources.size > 0 && (
                        <button
                          onClick={() => setHiddenSources(new Set())}
                          className="text-[10px] text-brand-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-medium"
                        >
                          Show all
                        </button>
                      )}
                    </div>
                  )}

                  {/* Nothing squarely on-topic, so be honest, then show the closest */}
                  {!provisional && coreResults.length === 0 && relatedResults.length > 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nothing landed squarely on your topic, but here are the closest related sources.
                    </p>
                  )}

                  {/* Relevant tier: directly about the topic, shown by default */}
                  {coreResults.map((paper, i) => (
                    <PaperCard
                      key={paperId(paper) || i}
                      paper={paper}
                      citationStyle={style}
                      index={i}
                      query={searchedQuery}
                      isSaved={savedIds.has(paperId(paper))}
                      onToggleSave={handleToggleSave}
                      showStance={isArgument}
                    />
                  ))}

                  {/* Related & background tier: revealed only when the student asks */}
                  {!provisional && relatedResults.length > 0 && (
                    <div className="flex flex-col gap-3 pt-1">
                      {coreResults.length > 0 && !relatedOpen && (
                        <button
                          onClick={() => setShowRelated(true)}
                          className="group w-full rounded-[3px] border border-dashed border-gray-300 dark:border-gray-700 hover:border-brand-500 dark:hover:border-brand-600 bg-paper-100/40 dark:bg-ink-900/40 px-4 py-3 flex flex-col items-center gap-0.5 transition-colors"
                        >
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                            Show {relatedResults.length} related &amp; background {relatedResults.length === 1 ? 'source' : 'sources'}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-600">
                            Tied to your topic but not fully about it: context and adjacent findings
                          </span>
                        </button>
                      )}
                      {relatedOpen && (
                        <>
                          {coreResults.length > 0 && (
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                              <span className="eyebrow">Related &amp; background · {relatedResults.length}</span>
                              <button
                                onClick={() => setShowRelated(false)}
                                className="text-xs text-brand-500 hover:text-brand-600 dark:hover:text-brand-400 font-medium transition-colors"
                              >
                                Hide
                              </button>
                            </div>
                          )}
                          {relatedResults.map((paper, i) => (
                            <PaperCard
                              key={paperId(paper) || `rel-${i}`}
                              paper={paper}
                              citationStyle={style}
                              index={coreResults.length + i}
                              query={searchedQuery}
                              isSaved={savedIds.has(paperId(paper))}
                              onToggleSave={handleToggleSave}
                              showStance={isArgument}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}

                  {!provisional && (
                    <button
                      onClick={handleFindMore}
                      disabled={moreLoading}
                      className="btn-secondary w-full py-2.5 text-sm disabled:opacity-40"
                    >
                      {moreLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Searching from new angles…
                        </span>
                      ) : 'Find more sources'}
                    </button>
                  )}

                  {/* Ask about sources */}
                  {!provisional && (
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={askQuestion}
                          onChange={e => setAskQuestion(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAsk()}
                          placeholder="Ask a question about these sources…"
                          className="flex-1 rounded-[3px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-ink-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 dark:focus:border-brand-600 transition-all"
                        />
                        <button
                          onClick={handleAsk}
                          disabled={!askQuestion.trim() || asking}
                          className="btn-primary text-sm disabled:opacity-40"
                        >
                          {asking ? '…' : 'Ask'}
                        </button>
                      </div>
                      {askAnswer && (
                        <div className="card border-l-2 border-l-brand-500 p-4 flex flex-col gap-1.5 animate-fadeInUp">
                          <span className="eyebrow !text-brand-700 dark:!text-brand-400">Answer</span>
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{askAnswer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right column: project + works cited ── */}
        <aside className="hidden lg:block sticky top-20">
          <ProjectSidebar
            projects={store.projects}
            activeId={store.activeId}
            onSelectProject={id => updateStore(prev => ({ ...prev, activeId: id }))}
            onCreateProject={name => updateStore(prev => {
              const p = newProject(name)
              return { projects: [p, ...prev.projects], activeId: p.id }
            })}
            onDeleteProject={id => updateStore(prev => {
              const projects = prev.projects.filter(p => p.id !== id)
              return { projects, activeId: projects[0]?.id || null }
            })}
            onRemoveSource={paper => handleToggleSave(paper)}
            citationStyle={style}
            onStyleChange={setStyle}
            onFindSources={q => { setQuery(q); runResearch(q) }}
          />
          {/* Always present, below the project: a quiet 3D accent that keeps the
              search service itself front and centre in the main column. */}
          <div className="flex flex-col items-center gap-2 pt-9 pb-2">
            <HeroEmblem />
            <span className="eyebrow opacity-70">15 databases · one bibliography</span>
          </div>
        </aside>
      </main>

      {/* Mobile: bibliography drawer */}
      <button
        onClick={() => setShowSidebar(true)}
        className="lg:hidden fixed bottom-5 right-5 z-20 btn-primary shadow-lg flex items-center gap-2 rounded-full px-4 py-2.5"
        aria-label="Open your paper panel"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Your paper{bibCount > 0 && ` · ${bibCount}`}
      </button>

      {showSidebar && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowSidebar(false) }}>
          <div className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto p-3 animate-fadeInUp">
            <ProjectSidebar
              projects={store.projects}
              activeId={store.activeId}
              onSelectProject={id => updateStore(prev => ({ ...prev, activeId: id }))}
              onCreateProject={name => updateStore(prev => {
                const p = newProject(name)
                return { projects: [p, ...prev.projects], activeId: p.id }
              })}
              onDeleteProject={id => updateStore(prev => {
                const projects = prev.projects.filter(p => p.id !== id)
                return { projects, activeId: projects[0]?.id || null }
              })}
              onRemoveSource={paper => handleToggleSave(paper)}
              citationStyle={style}
              onStyleChange={setStyle}
              onFindSources={q => { setShowSidebar(false); setQuery(q); runResearch(q) }}
              onClose={() => setShowSidebar(false)}
            />
          </div>
        </div>
      )}

      <footer className="border-t border-gray-200/60 dark:border-gray-800/60 py-6 text-center text-xs text-gray-400 dark:text-gray-600">
        Firmo · sources from Semantic Scholar, PubMed, OpenAlex, CrossRef + 11 more · citations via CrossRef · PDFs via Unpaywall
      </footer>

      {showWalkthrough && <Walkthrough onClose={() => setShowWalkthrough(false)} />}
      {showChangelog && <Changelog onClose={() => setShowChangelog(false)} />}
    </div>
  )
}
