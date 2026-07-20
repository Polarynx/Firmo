import { useEffect, useMemo, useState } from 'react'
import { postJSON } from '../lib/api'
import { inTextCitation } from '../lib/cite'
import { paperId } from '../lib/projects'
import { SOURCE_LABELS } from '../lib/constants'

// The coach's statuses. The reframe from the old fact-checker: not "is this
// true?" but "can you back this up?" — every color tells the student what to DO.
const STATUS = {
  checking: {
    label: 'Checking…',
    mark: 'bg-gray-200/60 dark:bg-gray-700/50 animate-pulse',
    chip: 'text-gray-500 border-gray-300 dark:text-gray-400 dark:border-gray-600',
    dot: 'bg-gray-400',
  },
  needs_citation: {
    label: 'Needs a citation',
    mark: 'bg-amber-200/70 dark:bg-amber-500/25 hover:bg-amber-300/70 dark:hover:bg-amber-500/40 cursor-pointer',
    chip: 'text-amber-700 border-amber-400/60 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-400',
  },
  shaky: {
    label: 'Evidence disagrees',
    mark: 'bg-red-200/70 dark:bg-red-500/25 hover:bg-red-300/70 dark:hover:bg-red-500/40 cursor-pointer',
    chip: 'text-red-600 border-red-300/70 dark:text-red-400 dark:border-red-800/70',
    dot: 'bg-red-500',
  },
  backed: {
    label: 'Covered by your sources',
    mark: 'bg-brand-200/70 dark:bg-brand-500/25 hover:bg-brand-300/60 dark:hover:bg-brand-500/40 cursor-pointer',
    chip: 'text-brand-700 border-brand-400/60 dark:text-brand-300 dark:border-brand-700',
    dot: 'bg-brand-500',
  },
  cited: {
    label: 'Cited',
    mark: 'bg-brand-100 dark:bg-brand-900/40 cursor-pointer',
    chip: 'text-brand-700 border-brand-400/60 dark:text-brand-300 dark:border-brand-700',
    dot: 'bg-brand-500',
  },
  rewritten: {
    label: 'Reworded',
    mark: 'bg-brand-100 dark:bg-brand-900/40 cursor-pointer',
    chip: 'text-brand-700 border-brand-400/60 dark:text-brand-300 dark:border-brand-700',
    dot: 'bg-brand-500',
  },
  fine: {
    label: 'No citation needed',
    mark: 'underline decoration-dotted decoration-gray-400 dark:decoration-gray-600 underline-offset-4 cursor-pointer',
    chip: 'text-gray-600 border-gray-300 dark:text-gray-400 dark:border-gray-600',
    dot: 'bg-gray-400',
  },
  unchecked: {
    label: 'Not checked',
    chip: 'text-gray-500 border-gray-300 dark:text-gray-400 dark:border-gray-600',
    mark: 'bg-gray-200/60 dark:bg-gray-700/50 cursor-pointer',
    dot: 'bg-gray-400',
  },
}

// Attention-first order for the summary chips.
const STATUS_ORDER = ['shaky', 'needs_citation', 'backed', 'cited', 'rewritten', 'fine', 'unchecked', 'checking']

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Locate a quote in the draft: exact match first, then a whitespace-tolerant
// regex so a quote the LLM re-spaced still finds its sentence.
function findQuote(text, quote, from = 0) {
  if (!quote) return null
  const idx = text.indexOf(quote, from)
  if (idx >= 0) return [idx, idx + quote.length]
  const words = quote.trim().split(/\s+/).map(escapeRe)
  if (words.length === 0) return null
  try {
    const re = new RegExp(words.join('[\\s\\u00A0]+'), 'g')
    re.lastIndex = from
    const m = re.exec(text)
    if (m) return [m.index, m.index + m[0].length]
  } catch { /* bad pattern → treat as not found */ }
  return null
}

// Pin every claim to a character span, skipping spans already taken so two
// claims never fight over the same sentence. Unpinned claims get start: -1 and
// are listed below the draft instead of highlighted.
function placeClaims(text, claims) {
  const used = []
  return claims.map(c => {
    let span = findQuote(text, c.quote)
    while (span && used.some(([s, e]) => span[0] < e && span[1] > s)) {
      span = findQuote(text, c.quote, span[0] + 1)
    }
    if (!span) return { ...c, start: -1, end: -1 }
    used.push(span)
    return { ...c, start: span[0], end: span[1] }
  })
}

function splitParagraphs(text) {
  const paras = []
  let offset = 0
  for (const part of text.split('\n')) {
    paras.push({ text: part, start: offset, end: offset + part.length })
    offset += part.length + 1
  }
  return paras
}

function StatusChip({ status, count }) {
  const v = STATUS[status]
  if (!v) return null
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border ${v.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
      {v.label}
      {count != null && <span className="opacity-60">{count}</span>}
    </span>
  )
}

// A compact source row for the inline detail card: enough to judge the source,
// one button to act on it.
function SourceRow({ paper, actionLabel, onAction, done, doneLabel = '✓ Cited' }) {
  const authors = Array.isArray(paper.authors) ? paper.authors : []
  const surname = authors.length > 0 ? String(authors[0]).trim().split(' ').pop() : null
  const bits = [
    surname,
    paper.year,
    paper.journal || SOURCE_LABELS[paper.source] || null,
    paper.citationCount > 0 ? `${paper.citationCount.toLocaleString()} cited` : null,
  ].filter(Boolean)
  return (
    <div className="flex items-start justify-between gap-3 rounded-[3px] border border-gray-100 dark:border-gray-800 bg-paper-50/70 dark:bg-ink-950/60 px-3 py-2.5">
      <div className="flex flex-col gap-1 min-w-0">
        {paper.url ? (
          <a href={paper.url} target="_blank" rel="noopener noreferrer"
            className="text-[13px] font-medium text-gray-800 dark:text-gray-200 leading-snug hover:text-brand-700 dark:hover:text-brand-400 transition-colors line-clamp-2">
            {paper.title}
          </a>
        ) : (
          <span className="text-[13px] font-medium text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">{paper.title}</span>
        )}
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
          {bits.join(' · ')}
          {paper.retracted && <span className="text-red-500 font-medium"> · retracted</span>}
          {!paper.retracted && paper.preprint && <span className="text-amber-600 dark:text-amber-400"> · preprint</span>}
        </span>
      </div>
      {onAction && (
        <button
          onClick={onAction}
          disabled={done}
          className={`shrink-0 text-xs ${done ? 'btn-secondary opacity-60' : 'btn-primary'}`}
        >
          {done ? doneLabel : actionLabel}
        </button>
      )}
    </div>
  )
}

function ClaimDetail({ claim, onClose, onCite, onApplyRewrite, onFindSources }) {
  const v = STATUS[claim.status] || STATUS.checking
  const sources = Array.isArray(claim.sources) ? claim.sources : []
  return (
    <div className="card p-4 flex flex-col gap-3 border-l-4 border-l-gray-200 dark:border-l-gray-700 animate-fadeInUp my-2">
      <div className="flex items-start justify-between gap-3">
        <StatusChip status={claim.status} />
        <button onClick={onClose} className="text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400 transition-colors" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {claim.status === 'checking' ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulseDot shrink-0" />
          Finding real sources for this claim…
        </p>
      ) : (
        <>
          {claim.explanation && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{claim.explanation}</p>
          )}

          {claim.status === 'cited' && claim.citedAs && (
            <p className="text-xs text-brand-700 dark:text-brand-300">
              Inserted <span className="font-mono">{claim.citedAs}</span> and saved the source to your bibliography.
            </p>
          )}

          {claim.status === 'shaky' && claim.rewrite && (
            <div className="border-l-2 border-l-red-400 bg-red-50/60 dark:bg-red-950/20 rounded-[2px] px-3 py-2.5 flex flex-col gap-2">
              <span className="eyebrow !text-red-600 dark:!text-red-400">Suggested rewrite</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{claim.rewrite}</p>
              <button onClick={onApplyRewrite} className="btn-primary text-xs self-start">
                {claim.start >= 0 ? 'Use this wording' : (claim.copied ? '✓ Copied' : 'Copy rewrite')}
              </button>
            </div>
          )}

          {claim.status === 'backed' && claim.saved_match && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Already in your bibliography</span>
              <SourceRow
                paper={claim.saved_match}
                actionLabel={claim.start >= 0 ? 'Insert citation' : 'Copy citation'}
                onAction={() => onCite(claim.saved_match)}
              />
            </div>
          )}

          {(claim.status === 'needs_citation' || claim.status === 'shaky') && sources.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">{claim.status === 'shaky' ? 'What the evidence says' : 'Sources that back this'}</span>
              {sources.map((p, i) => (
                <SourceRow
                  key={paperId(p) || i}
                  paper={p}
                  actionLabel={claim.start >= 0 ? 'Cite & save' : 'Copy & save'}
                  onAction={() => onCite(p)}
                />
              ))}
            </div>
          )}

          {claim.status === 'needs_citation' && sources.length === 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400 dark:text-gray-600">No solid sources surfaced for this one.</p>
              <button onClick={() => onFindSources(claim.claim)} className="btn-secondary text-xs shrink-0">
                Search in Find sources
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// The Argument tab: what a writing tutor checks and the claims pass can't see —
// thesis, paragraph flow, and whether an opposing view gets answered.
const SERVES = {
  yes: { dot: 'bg-brand-500', note: null },
  weak: { dot: 'bg-amber-400' },
  no: { dot: 'bg-red-500' },
}

function FoundChip({ ok, yes, no }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border ${
      ok
        ? 'text-brand-700 border-brand-400/60 dark:text-brand-300 dark:border-brand-700'
        : 'text-red-600 border-red-300/70 dark:text-red-400 dark:border-red-800/70'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-brand-500' : 'bg-red-500'}`} />
      {ok ? yes : no}
    </span>
  )
}

function ArgumentPanel({ data, loading, error, onRetry, savedIds, onToggleSave }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulseDot shrink-0" />
          Reading your draft the way a tutor would…
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-4 flex flex-col gap-2.5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-[3px] border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 p-4 flex items-center justify-between gap-3">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <button onClick={onRetry} className="btn-secondary text-xs shrink-0">Retry</button>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="flex flex-col gap-3">
      {data.top_fix && (
        <div className="border-l-2 border-l-brand-500 bg-brand-50/60 dark:bg-brand-950/20 rounded-[2px] px-4 py-3">
          <span className="eyebrow !text-brand-700 dark:!text-brand-400 block mb-1">Biggest win</span>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{data.top_fix}</p>
        </div>
      )}

      <div className="card p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Thesis</span>
          <FoundChip ok={data.thesis.found} yes="Found" no="Missing" />
        </div>
        {data.thesis.quote && (
          <p className="text-sm italic text-gray-700 dark:text-gray-300 leading-relaxed">“{data.thesis.quote}”</p>
        )}
        {data.thesis.assessment && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{data.thesis.assessment}</p>
        )}
      </div>

      {data.paragraphs.length > 0 && (
        <div className="card p-4 flex flex-col gap-2.5">
          <span className="eyebrow">Paragraph map · does each one serve the thesis?</span>
          {data.paragraphs.map((p, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="font-mono text-[10px] text-gray-400 dark:text-gray-600 mt-0.5 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${(SERVES[p.serves_thesis] || SERVES.yes).dot}`} />
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{p.summary}</p>
                {p.note && <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{p.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Counterargument</span>
          <FoundChip ok={data.counterargument.found} yes="Addressed" no="Missing" />
        </div>
        {data.counterargument.note && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{data.counterargument.note}</p>
        )}
        {data.counter_sources?.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="eyebrow !text-amber-700 dark:!text-amber-400">For your counterargument section</span>
            {data.counter_sources.map((p, i) => (
              <SourceRow
                key={paperId(p) || i}
                paper={p}
                actionLabel="Save"
                doneLabel="✓ Saved"
                done={savedIds?.has(paperId(p))}
                onAction={() => onToggleSave(p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Controlled component: draft text and claim state live in App.jsx.
export default function EssayChecker({
  text = '', onTextChange, claims, typos, meta, loading, error, statusMsg,
  onCheck, onCancel, onUpdateClaim, onClearResults, onDismissTypos,
  citationStyle = 'apa', savedIds, onToggleSave, onFindSources,
}) {
  const [selectedId, setSelectedId] = useState(null)
  const [copiedDraft, setCopiedDraft] = useState(false)
  const [tab, setTab] = useState('claims') // 'claims' | 'argument'
  const [argData, setArgData] = useState(null)
  const [argLoading, setArgLoading] = useState(false)
  const [argError, setArgError] = useState('')

  // A fresh check invalidates the previous structural review.
  useEffect(() => {
    setTab('claims')
    setArgData(null)
    setArgError('')
  }, [claims])

  async function loadArgument() {
    if (argData || argLoading) return
    setArgLoading(true)
    setArgError('')
    try {
      const data = await postJSON('/api/argument-review', { text })
      setArgData(data)
    } catch {
      setArgError("Couldn't review the argument just now.")
    } finally {
      setArgLoading(false)
    }
  }

  const placed = useMemo(
    () => (claims ? placeClaims(text, claims) : []),
    [text, claims]
  )
  const paragraphs = useMemo(() => splitParagraphs(text), [text])
  const unplaced = placed.filter(c => c.start < 0)
  const selected = placed.find(c => c.id === selectedId) || null

  const counts = placed.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  // Insert the in-text citation right after the claim's sentence (before its
  // closing punctuation), and save the source to the project in the same click.
  // The claim's quote is updated to include the citation so the highlight stays
  // pinned to the sentence after the text changes.
  function handleCite(claim, paper) {
    const cite = inTextCitation(paper, citationStyle)
    let newQuote = claim.quote
    if (claim.start >= 0) {
      const matched = text.slice(claim.start, claim.end)
      if (/[.!?,;:]/.test(matched.slice(-1))) {
        newQuote = matched.slice(0, -1) + ' ' + cite + matched.slice(-1)
      } else {
        newQuote = matched + ' ' + cite
      }
      onTextChange(text.slice(0, claim.start) + newQuote + text.slice(claim.end))
    } else {
      navigator.clipboard?.writeText(cite)
    }
    if (onToggleSave && !savedIds?.has(paperId(paper))) onToggleSave(paper)
    onUpdateClaim(claim.id, { status: 'cited', citedAs: cite, quote: newQuote })
  }

  function handleApplyRewrite(claim) {
    if (!claim.rewrite) return
    if (claim.start >= 0) {
      let rw = claim.rewrite
      // A mid-sentence phrase keeps its surrounding punctuation: drop the
      // rewrite's trailing period when the draft already continues after it.
      const next = text[claim.end]
      if (next && /[.,;:!?]/.test(next)) rw = rw.replace(/[.!?]+\s*$/, '')
      onTextChange(text.slice(0, claim.start) + rw + text.slice(claim.end))
      onUpdateClaim(claim.id, { status: 'rewritten', quote: rw })
    } else {
      navigator.clipboard?.writeText(claim.rewrite)
      onUpdateClaim(claim.id, { copied: true })
    }
  }

  function applyTypos() {
    if (!typos || typos.length === 0) return
    let t = text
    for (const { from, to } of typos) {
      t = t.replace(new RegExp(`\\b${escapeRe(from)}\\b`, 'g'), to)
    }
    onTextChange(t)
    // keep highlights matching: fix the same words inside each claim's quote
    for (const c of (claims || [])) {
      let q = c.quote
      for (const { from, to } of typos) {
        q = q.replace(new RegExp(`\\b${escapeRe(from)}\\b`, 'g'), to)
      }
      if (q !== c.quote) onUpdateClaim(c.id, { quote: q })
    }
    onDismissTypos()
  }

  function copyDraft() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedDraft(true)
      setTimeout(() => setCopiedDraft(false), 2000)
    })
  }

  function renderParagraph(para, pi) {
    const inPara = placed
      .filter(c => c.start >= 0 && c.start >= para.start && c.start < para.end)
      .sort((a, b) => a.start - b.start)
    if (!para.text.trim()) return <div key={pi} className="h-3" />

    const segments = []
    let cursor = para.start
    for (const c of inPara) {
      if (c.start > cursor) segments.push({ text: text.slice(cursor, c.start) })
      const end = Math.min(c.end, para.end)
      segments.push({ text: text.slice(c.start, end), claim: c })
      cursor = end
    }
    if (cursor < para.end) segments.push({ text: text.slice(cursor, para.end) })

    const selectedHere = selected && selected.start >= para.start && selected.start < para.end
    return (
      <div key={pi}>
        <p className="text-[15px] leading-[1.85] text-gray-800 dark:text-gray-200">
          {segments.map((seg, si) =>
            seg.claim ? (
              <mark
                key={si}
                onClick={() => setSelectedId(seg.claim.id === selectedId ? null : seg.claim.id)}
                className={`rounded-[2px] px-0.5 -mx-0.5 text-inherit transition-colors ${(STATUS[seg.claim.status] || STATUS.checking).mark} ${seg.claim.id === selectedId ? 'ring-2 ring-brand-500/50' : ''}`}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={si}>{seg.text}</span>
            )
          )}
        </p>
        {selectedHere && (
          <ClaimDetail
            claim={selected}
            onClose={() => setSelectedId(null)}
            onCite={paper => handleCite(selected, paper)}
            onApplyRewrite={() => handleApplyRewrite(selected)}
            onFindSources={onFindSources}
          />
        )}
      </div>
    )
  }

  // ── Input mode: no results yet ──────────────────────────────────────────────
  if (!claims) {
    return (
      <div className="w-full flex flex-col gap-4">
        <textarea
          value={text}
          onChange={e => onTextChange(e.target.value)}
          placeholder="Paste your draft. Firmo highlights every factual claim right in your text: what needs a citation (with real sources ready to insert), what your saved sources already cover, and what the evidence disagrees with."
          rows={10}
          readOnly={loading}
          className="w-full resize-y rounded-[3px] border border-gray-200 dark:border-gray-800
            bg-white dark:bg-ink-900 text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-600
            px-4 py-3 text-sm leading-relaxed
            focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 dark:focus:border-brand-600
            transition-all duration-150"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-600">
            Any length · up to ~4,000 words checked per run
          </span>
          {loading ? (
            <button
              onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2 rounded-[3px] border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400
                hover:border-red-300 hover:text-red-500 dark:hover:border-red-700 dark:hover:text-red-400
                text-sm font-medium transition-all duration-150"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => onCheck(text)}
              disabled={!text.trim()}
              className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Check draft
            </button>
          )}
        </div>
        {loading && (
          <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulseDot shrink-0" />
            {statusMsg || 'Reading your draft…'}
          </div>
        )}
        {error && (
          <div className="rounded-[3px] border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    )
  }

  // ── Review mode: the annotated draft ────────────────────────────────────────
  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="eyebrow">
          {claims.length === 0
            ? 'No checkable claims found'
            : `${claims.length} claim${claims.length !== 1 ? 's' : ''} · click a highlight to act on it`}
        </p>
        <div className="flex items-center gap-2">
          {loading ? (
            <button onClick={onCancel} className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors">
              Cancel
            </button>
          ) : (
            <>
              <button onClick={copyDraft} className="btn-secondary text-xs">
                {copiedDraft ? '✓ Copied' : 'Copy draft'}
              </button>
              <button onClick={() => { setSelectedId(null); onClearResults() }} className="btn-secondary text-xs">
                Edit draft
              </button>
              <button onClick={() => { setSelectedId(null); onCheck(text) }} className="btn-primary text-xs">
                Re-check
              </button>
            </>
          )}
        </div>
      </div>

      {/* Two lenses on the same draft: Claims (the evidence) and Argument (the structure) */}
      <div className="flex rounded-[3px] overflow-hidden border border-gray-300 dark:border-gray-700 self-start text-xs font-medium">
        <button
          onClick={() => setTab('claims')}
          className={`px-3.5 py-1.5 transition-colors ${tab === 'claims' ? 'bg-brand-700 text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-paper-100 dark:hover:bg-ink-800'}`}
        >
          Claims
        </button>
        <button
          onClick={() => { setTab('argument'); loadArgument() }}
          className={`px-3.5 py-1.5 transition-colors ${tab === 'argument' ? 'bg-brand-700 text-white' : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:bg-paper-100 dark:hover:bg-ink-800'}`}
        >
          Argument
        </button>
      </div>

      {tab === 'argument' && (
        <ArgumentPanel
          data={argData}
          loading={argLoading}
          error={argError}
          onRetry={loadArgument}
          savedIds={savedIds}
          onToggleSave={onToggleSave}
        />
      )}

      {tab === 'claims' && (<>
      {claims.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_ORDER.filter(k => counts[k]).map(k => (
            <StatusChip key={k} status={k} count={counts[k]} />
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulseDot shrink-0" />
          {statusMsg || 'Checking claims against real sources…'}
        </div>
      )}

      {typos && typos.length > 0 && (
        <div className="rounded-[3px] border border-gray-200 dark:border-gray-700 bg-paper-100/60 dark:bg-ink-900/60 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {typos.length} spelling fix{typos.length !== 1 ? 'es' : ''} suggested
            <span className="text-gray-400 dark:text-gray-600"> · {typos.slice(0, 3).map(t => `${t.from} → ${t.to}`).join(', ')}{typos.length > 3 ? '…' : ''}</span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={applyTypos} className="btn-primary text-xs">Apply</button>
            <button onClick={onDismissTypos} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-medium transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {meta?.truncated && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Long draft: Firmo checked the first ~{Math.round((meta.checkedChars || 0) / 6).toLocaleString()} words this run.
          Paste the rest separately to cover it all.
        </p>
      )}

      {error && (
        <div className="rounded-[3px] border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* The draft itself, highlights in place */}
      <div className="card px-5 py-4 sm:px-6 sm:py-5 flex flex-col gap-1">
        {claims.length === 0 && !loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
            Nothing here needs backing up with evidence. Firmo checks factual claims, not opinions or
            style, so this reads as opinion, narrative, or common knowledge.
          </p>
        ) : (
          paragraphs.map(renderParagraph)
        )}
      </div>

      {/* Claims the coach couldn't pin to an exact sentence */}
      {unplaced.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Couldn't pin {unplaced.length === 1 ? 'this claim' : 'these claims'} to a sentence</span>
          {unplaced.map(c => (
            <div key={c.id}>
              <button
                onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                className="w-full text-left card px-4 py-2.5 flex items-center justify-between gap-3 hover:border-brand-400 dark:hover:border-brand-600 transition-colors"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{c.claim}</span>
                <StatusChip status={c.status} />
              </button>
              {selected?.id === c.id && (
                <ClaimDetail
                  claim={selected}
                  onClose={() => setSelectedId(null)}
                  onCite={paper => handleCite(selected, paper)}
                  onApplyRewrite={() => handleApplyRewrite(selected)}
                  onFindSources={onFindSources}
                />
              )}
            </div>
          ))}
        </div>
      )}
      </>)}
    </div>
  )
}
