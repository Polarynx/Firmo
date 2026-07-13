import { YEAR_OPTIONS } from '../lib/constants'

export default function ResearchInput({ query, onQueryChange, yearFrom, onYearFromChange, onSearch, onCancel, loading }) {
  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading) onSearch()
    }
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <textarea
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={'Your topic, thesis, or research question. For example, "the effects of sleep deprivation on memory" or "school uniforms improve student focus"'}
        rows={3}
        className="w-full resize-none rounded-[3px]
          border border-gray-200 dark:border-gray-800
          bg-white dark:bg-ink-900
          text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600
          px-4 py-3.5 text-[15px] leading-relaxed shadow-sm
          focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-400 dark:focus:border-brand-600
          transition-all duration-150"
      />

      <div className="flex items-center gap-2">
        <select
          value={yearFrom ?? ''}
          onChange={e => onYearFromChange(e.target.value ? parseInt(e.target.value) : null)}
          className="text-xs font-medium px-2 py-2 rounded-[3px] border border-gray-200 dark:border-gray-800
            bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-500
            hover:text-gray-800 dark:hover:text-gray-200
            focus:outline-none focus:ring-2 focus:ring-brand-500/50
            transition-colors cursor-pointer"
          aria-label="Publication year filter"
        >
          {YEAR_OPTIONS.map(opt => (
            <option key={opt.value ?? 'any'} value={opt.value ?? ''}>
              {opt.label}
            </option>
          ))}
        </select>

        {loading ? (
          <button
            onClick={onCancel}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-[3px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 hover:border-red-300 hover:text-red-500 dark:hover:border-red-700 dark:hover:text-red-400 text-sm font-medium transition-all duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel
          </button>
        ) : (
          <button
            onClick={onSearch}
            disabled={!query.trim()}
            className="ml-auto btn-primary flex items-center gap-2 px-5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            Find sources
          </button>
        )}
      </div>
    </div>
  )
}
