// Check citations: paste a finished works-cited list; every entry is verified
// against publisher records. Catches typos, wrong years, retracted papers, and
// citations that don't exist — the last check before hand-in.

const VERDICTS = {
  checking: {
    label: 'Checking…',
    chip: 'text-gray-500 border-gray-300 dark:text-gray-400 dark:border-gray-600',
    dot: 'bg-gray-400 animate-pulseDot',
    rail: 'border-l-gray-300 dark:border-l-gray-600',
  },
  verified: {
    label: 'Verified',
    chip: 'text-brand-700 border-brand-400/60 dark:text-brand-300 dark:border-brand-700',
    dot: 'bg-brand-500',
    rail: 'border-l-brand-500',
  },
  mismatch: {
    label: 'Check details',
    chip: 'text-amber-700 border-amber-400/60 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-400',
    rail: 'border-l-amber-400',
  },
  retracted: {
    label: 'Retracted',
    chip: 'text-red-600 border-red-300/70 dark:text-red-400 dark:border-red-800/70',
    dot: 'bg-red-500',
    rail: 'border-l-red-500',
  },
  not_found: {
    label: 'Not found',
    chip: 'text-red-600 border-red-300/70 dark:text-red-400 dark:border-red-800/70',
    dot: 'bg-red-500',
    rail: 'border-l-red-400',
  },
  unchecked: {
    label: 'Try again',
    chip: 'text-gray-500 border-gray-300 dark:text-gray-400 dark:border-gray-600',
    dot: 'bg-gray-400',
    rail: 'border-l-gray-300 dark:border-l-gray-600',
  },
}

const VERDICT_ORDER = ['not_found', 'retracted', 'mismatch', 'unchecked', 'verified', 'checking']

function Chip({ verdict, count }) {
  const v = VERDICTS[verdict]
  if (!v) return null
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border ${v.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
      {v.label}
      {count != null && <span className="opacity-60">{count}</span>}
    </span>
  )
}

export default function CitationChecker({
  text = '', onTextChange, items, loading, error, statusMsg, onCheck, onCancel,
}) {
  const counts = (items || []).reduce((acc, it) => {
    acc[it.verdict] = (acc[it.verdict] || 0) + 1
    return acc
  }, {})

  return (
    <div className="w-full flex flex-col gap-4">
      <textarea
        value={text}
        onChange={e => onTextChange(e.target.value)}
        placeholder="Paste your finished works-cited or references list. Firmo checks every entry against publisher records: real or invented, right year, right authors, not retracted."
        rows={8}
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
          Any style · up to 30 entries per run
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
            Check citations
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulseDot shrink-0" />
          {statusMsg || 'Reading your reference list…'}
        </div>
      )}

      {error && (
        <div className="rounded-[3px] border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {items && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="eyebrow">
              {items.length === 0
                ? 'No citation entries found in that text'
                : `${items.length} entr${items.length !== 1 ? 'ies' : 'y'} checked against publisher records`}
            </p>
            {items.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {VERDICT_ORDER.filter(k => counts[k]).map(k => (
                  <Chip key={k} verdict={k} count={counts[k]} />
                ))}
              </div>
            )}
          </div>

          {items.map((it, i) => {
            const v = VERDICTS[it.verdict] || VERDICTS.checking
            return (
              <div
                key={i}
                className={`card p-4 flex flex-col gap-2 border-l-4 ${v.rail} animate-fadeInUp`}
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-mono text-xs text-gray-700 dark:text-gray-300 leading-relaxed break-words">
                    {it.raw}
                  </p>
                  <span className="shrink-0"><Chip verdict={it.verdict} /></span>
                </div>
                {it.note && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{it.note}</p>
                )}
                {it.matched?.url && (
                  <a
                    href={it.matched.url}
                    target="_blank" rel="noopener noreferrer"
                    className="self-start text-xs text-brand-600 dark:text-brand-400 hover:text-brand-500 font-medium transition-colors"
                  >
                    View the published record ↗
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
