
// A claim gets one plain verdict about how the evidence treats it — not a number.
// "Contested" wins when scholars genuinely disagree; otherwise confidence decides.
const VERDICTS = {
  supported: {
    label: 'Well-supported',
    pill: 'text-brand-700 border-brand-400/60 dark:text-brand-300 dark:border-brand-700',
    dot: 'bg-brand-500',
    rail: 'border-l-brand-500 dark:border-l-brand-500',
  },
  contested: {
    label: 'Contested',
    pill: 'text-amber-700 border-amber-400/60 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-400',
    rail: 'border-l-amber-400 dark:border-l-amber-400',
  },
  uncertain: {
    label: 'Uncertain',
    pill: 'text-gray-600 border-gray-300 dark:text-gray-400 dark:border-gray-600',
    dot: 'bg-gray-400',
    rail: 'border-l-gray-300 dark:border-l-gray-600',
  },
  unsupported: {
    label: 'Unsupported',
    pill: 'text-red-600 border-red-300/70 dark:text-red-400 dark:border-red-800/70',
    dot: 'bg-red-500',
    rail: 'border-l-red-400 dark:border-l-red-500',
  },
}

function verdictFor(item) {
  // Trust the model's explicit verdict; fall back to the old numeric signal only
  // for responses that predate the verdict field.
  if (item.verdict && VERDICTS[item.verdict]) return VERDICTS[item.verdict]
  if (item.is_debatable) return VERDICTS.contested
  if (item.confidence >= 65) return VERDICTS.supported
  if (item.confidence <= 35) return VERDICTS.unsupported
  return VERDICTS.uncertain
}

function ClaimCard({ item, index, onSearch }) {
  const v = verdictFor(item)

  return (
    <div
      className={`card p-4 flex flex-col gap-2.5 border-l-4 ${v.rail} animate-fadeInUp`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">{item.claim}</p>
        <span className={`shrink-0 inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border ${v.pill}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
          {v.label}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.response}</p>
      <button onClick={() => onSearch(item.claim)} className="self-start btn-secondary text-xs mt-0.5">
        Find sources for this claim →
      </button>
    </div>
  )
}

// Controlled component — all state lives in App.jsx
export default function EssayChecker({ text = '', onTextChange, results, loading, error, onCheck, onCancel, onSearchClaim }) {
  return (
    <div className="w-full flex flex-col gap-4">
      <textarea
        value={text}
        onChange={e => onTextChange(e.target.value)}
        placeholder="Paste your draft — Firmo pulls out every factual claim, marks each one well-supported, uncertain, contested, or unsupported, and helps you find sources for the shaky ones."
        rows={6}
        className="w-full resize-none rounded-[3px] border border-gray-200 dark:border-gray-800
          bg-white dark:bg-ink-900 text-gray-900 dark:text-gray-100
          placeholder-gray-400 dark:placeholder-gray-600
          px-4 py-3 text-sm
          focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 dark:focus:border-brand-600
          transition-all duration-150"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-600">Up to 8 claims detected</span>
        {loading ? (
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 rounded-[3px] border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400
              hover:border-red-300 hover:text-red-500 dark:hover:border-red-700 dark:hover:text-red-400
              text-sm font-medium transition-all duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
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
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600">
            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Extracting and evaluating claims…
          </div>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="card p-4 flex flex-col gap-2.5 border-l-4 border-l-gray-200 dark:border-l-gray-700 opacity-60">
              <div className="flex items-start justify-between gap-3">
                <div className="skeleton h-3.5 flex-1" />
                <div className="skeleton h-4 w-24 shrink-0" />
              </div>
              <div className="skeleton h-3 w-4/5" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-[3px] border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {results && !loading && (
        <div className="flex flex-col gap-3">
          <p className="eyebrow">
            {results.length === 0
              ? 'No verifiable claims found'
              : `${results.length} claim${results.length !== 1 ? 's' : ''} checked against the evidence`}
          </p>
          {results.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nothing here can be verified against evidence — Firmo checks facts, not opinions or wording. Try pasting a paragraph with factual statements.
            </p>
          ) : (
            results.map((item, i) => (
              <ClaimCard key={i} item={item} index={i} onSearch={onSearchClaim} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
