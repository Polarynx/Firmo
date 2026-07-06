const TYPE_LABELS = {
  topic: 'Topic',
  thesis: 'Thesis',
  question: 'Research question',
}

export default function BriefCard({ brief, onExplore }) {
  if (!brief) return null
  const angles = Array.isArray(brief.angles) ? brief.angles.filter(a => a && a.title) : []
  const related = Array.isArray(brief.related) ? brief.related : []

  return (
    <div className="card p-5 flex flex-col gap-4 animate-fadeInUp">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display italic font-semibold text-brand-600 dark:text-brand-400 text-sm">
            Research brief
          </span>
          {TYPE_LABELS[brief.input_type] && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-paper-100 dark:bg-ink-800 text-gray-500 dark:text-gray-400">
              {TYPE_LABELS[brief.input_type]}
            </span>
          )}
        </div>
        <p className="text-gray-800 dark:text-gray-100 leading-relaxed text-sm">{brief.brief}</p>
      </div>

      {angles.length > 0 && (
        <div className="flex flex-col gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            Strong angles for your paper
          </span>
          <div className="grid sm:grid-cols-2 gap-2">
            {angles.map((a, i) => (
              <div key={i} className="rounded-lg border border-gray-100 dark:border-gray-800 bg-paper-50 dark:bg-ink-950 px-3 py-2.5">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{a.title}</p>
                {a.why && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{a.why}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-600">Explore next:</span>
          {related.map((r, i) => (
            <button
              key={i}
              onClick={() => onExplore(r)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 text-gray-600 dark:text-gray-400 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
