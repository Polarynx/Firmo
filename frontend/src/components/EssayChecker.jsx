
function ConfidenceBar({ value }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-amber-400' : 'bg-red-400'
  const textColor = value >= 70
    ? 'text-green-600 dark:text-green-400'
    : value >= 40
    ? 'text-amber-500 dark:text-amber-400'
    : 'text-red-500 dark:text-red-400'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-mono font-semibold tabular-nums shrink-0 ${textColor}`}>{value}%</span>
    </div>
  )
}

function ClaimCard({ item, index, onSearch }) {
  const borderColor = item.confidence >= 70
    ? 'border-l-green-400 dark:border-l-green-600'
    : item.confidence >= 40
    ? 'border-l-amber-400 dark:border-l-amber-500'
    : 'border-l-red-400 dark:border-l-red-500'

  return (
    <div
      className={`card p-4 flex flex-col gap-2 border-l-4 ${borderColor} animate-fadeInUp`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">{item.claim}</p>
      <ConfidenceBar value={item.confidence} />
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.response}</p>
      <button onClick={() => onSearch(item.claim)} className="self-start btn-secondary text-xs mt-1">
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
        placeholder="Paste your draft — Firmo identifies every factual claim, scores how well-supported it is, and helps you find sources for the shaky ones."
        rows={6}
        className="w-full resize-none rounded-xl border border-gray-200 dark:border-gray-800
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700
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
            <div key={i} className="card p-4 flex flex-col gap-2 border-l-4 border-l-gray-200 dark:border-l-gray-700 opacity-60">
              <div className="skeleton h-3.5 w-full" />
              <div className="skeleton h-1 w-full mt-1" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {results && !loading && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-400 dark:text-gray-600">
            {results.length} claim{results.length !== 1 ? 's' : ''} found
          </p>
          {results.length === 0 ? (
            <p className="text-sm text-gray-400">No verifiable factual claims detected.</p>
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
