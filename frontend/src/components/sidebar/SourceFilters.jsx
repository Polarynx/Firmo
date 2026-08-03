import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useResearchStore } from '../../stores/useResearchStore'
import { SOURCE_LABELS, YEAR_OPTIONS, SPRING } from '../../lib/constants'

// ── One control, not four ───────────────────────────────────────────────────
//
// Sources grew a row at a time and each row was justified on its own. Subject
// groupings, published-since, which databases, and the related drawer: four
// bands of chips stacked above the results, so the papers a student came to
// read started four hundred pixels down the page.
//
// Filtering is also not what they are usually doing. The stacks already answer
// the common question — what have I got, what am I missing — and these are for
// the rarer moment when someone wants to narrow. So they fold into one line
// that names what is currently on, and open when asked.
//
// The line always says the truth about the current state, because a collapsed
// filter that hides an active filter is how somebody spends ten minutes
// wondering where half their results went.

export default function SourceFilters({ sourceCounts }) {
  const store = useResearchStore()
  const { facets, activeFacet, yearFrom, hiddenSources, searchedQuery } = store
  const setActiveFacet = useResearchStore(s => s.setActiveFacet)
  const setYearFrom = useResearchStore(s => s.setYearFrom)
  const toggleSourceFilter = useResearchStore(s => s.toggleSourceFilter)
  const clearSourceFilters = useResearchStore(s => s.clearSourceFilters)
  const executeSearch = useResearchStore(s => s.executeSearch)

  const [open, setOpen] = useState(false)

  const dbNames = Object.keys(sourceCounts || {})
  const hasAnything = facets.length > 0 || dbNames.length > 1 || !!searchedQuery
  if (!hasAnything) return null

  const active = [
    activeFacet,
    yearFrom ? `since ${yearFrom}` : null,
    hiddenSources.size ? `${hiddenSources.size} database${hiddenSources.size === 1 ? '' : 's'} hidden` : null,
  ].filter(Boolean)

  function clearAll() {
    if (activeFacet) setActiveFacet(activeFacet)
    if (hiddenSources.size) clearSourceFilters()
    if (yearFrom) { setYearFrom(null); executeSearch(searchedQuery) }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          data-demo="filters"
          onClick={() => setOpen(o => !o)}
          className={`inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-md
            border transition-colors ${active.length
              ? 'border-brand-500/50 text-brand-600 dark:text-signal bg-brand-500/[0.08]'
              : 'border-line text-t2 hover:text-t1 hover:border-edge'}`}
        >
          {active.length ? `Filtered · ${active.join(' · ')}` : 'Filter'}
          <span className={`text-[9px] transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        </button>

        {/* Undoing is one press, and it is visible without opening anything.
            A filter you cannot see the way out of is a filter people abandon
            the page over. */}
        {active.length > 0 && (
          <button
            onClick={clearAll}
            className="text-[11px] text-t3 hover:text-t1 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={SPRING}
            className="flex flex-col gap-3 rounded-lg border border-hair/10 bg-hair/[0.03] px-3.5 py-3"
          >
            {facets.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">What they cover</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {facets.map(f => (
                    <button
                      key={f.label}
                      data-demo="facet"
                      onClick={() => setActiveFacet(f.label)}
                      className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1
                        rounded-full border transition-colors ${activeFacet === f.label
                          ? 'border-brand-500/60 text-brand-600 dark:text-signal bg-brand-500/10'
                          : 'border-line text-t2 hover:text-t1 hover:border-edge'}`}
                    >
                      {f.label}
                      <span className="font-mono text-[9px] opacity-60">{f.ids.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchedQuery && (
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">Published</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {YEAR_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => { setYearFrom(opt.value); executeSearch(searchedQuery) }}
                      className={`font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5
                        rounded border transition-colors ${(yearFrom ?? null) === opt.value
                          ? 'border-brand-500/60 text-brand-600 dark:text-signal bg-brand-500/10'
                          : 'border-line text-t3 hover:text-t2 hover:border-edge'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {dbNames.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">Databases</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {dbNames.sort((a, b) => sourceCounts[b] - sourceCounts[a]).map(src => {
                    const off = hiddenSources.has(src)
                    return (
                      <button
                        key={src}
                        onClick={() => toggleSourceFilter(src)}
                        className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5
                          rounded border transition-colors ${off
                            ? 'border-line text-t3/60 line-through'
                            : 'border-line text-t2 hover:text-t1'}`}
                      >
                        {SOURCE_LABELS[src] || src}
                        <span className="font-mono text-[9px] opacity-60">{sourceCounts[src]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
