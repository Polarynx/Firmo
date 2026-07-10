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
    <div className="card border-t-2 border-t-brand-700 dark:border-t-brand-500 p-5 flex flex-col gap-4 animate-fadeInUp">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow !text-brand-700 dark:!text-brand-400">Research brief</span>
          {TYPE_LABELS[brief.input_type] && (
            <span className="eyebrow">{TYPE_LABELS[brief.input_type]}</span>
          )}
        </div>
        <p className="font-display text-gray-800 dark:text-gray-100 leading-relaxed text-[15px]">{brief.brief}</p>
      </div>

      {angles.length > 0 && (
        <div className="flex flex-col gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-800">
          <span className="eyebrow">Strong angles for your paper</span>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {angles.map((a, i) => (
              <div key={i} className="flex flex-col gap-0.5 border-l border-gray-200 dark:border-gray-700 pl-3">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{a.title}</p>
                {a.why && <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{a.why}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          <span className="eyebrow shrink-0">Explore next</span>
          {related.map((r, i) => (
            <button
              key={i}
              onClick={() => onExplore(r)}
              className="text-xs px-2.5 py-1 rounded-[3px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-ink-900 text-gray-600 dark:text-gray-400 hover:border-brand-500 dark:hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
