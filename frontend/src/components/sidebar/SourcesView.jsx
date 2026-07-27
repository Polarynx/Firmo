import { motion } from 'framer-motion'

import { useResearchStore, selectFiltered } from '../../stores/useResearchStore'
import { useUIStore } from '../../stores/useUIStore'
import { useSavedSources } from '../../stores/selectors'
import { paperId } from '../../lib/projects'
import { SOURCE_LABELS, STANCE, SPRING } from '../../lib/constants'
import { EmptyNote, SkeletonCard, StatusLine } from '../ui/primitives'
import SourceCard from './SourceCard'

// View 1: source discovery. Two tiers — squarely on-topic first, background
// behind a button — so the good stuff is never buried under the adjacent.

export default function SourcesView() {
  const store = useResearchStore()
  const {
    results, provisional, isSearching, statusMsg, stanceCounts, stanceFilter,
    inputType, searchedQuery, showRelated, hiddenSources, moreLoading, error,
  } = store

  const savedSources = useSavedSources()
  const setShowImport = useUIStore(s => s.setShowImport)

  // A plain topic has no sides to take, so stance chips would carry no meaning.
  const isArgument = inputType === 'thesis' || inputType === 'question'

  const filtered = selectFiltered(store)
  const core = filtered.filter(p => p.tier !== 'related')
  const related = filtered.filter(p => p.tier === 'related')
  const relatedOpen = showRelated || core.length === 0

  const sourceCounts = results.reduce((acc, p) => {
    if (p.source) acc[p.source] = (acc[p.source] || 0) + 1
    return acc
  }, {})

  // Nothing searched yet: show what is already in the project instead of a void.
  if (results.length === 0 && !isSearching) {
    if (savedSources.length > 0) {
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Saved to this paper</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="text-[11px] font-medium text-brand-600 dark:text-signal hover:opacity-75 transition-opacity"
              >
                Import
              </button>
              <span className="record">{savedSources.length}</span>
            </div>
          </div>
          {savedSources.map((p, i) => (
            <SourceCard key={paperId(p) || i} paper={p} index={i} showStance={false} compact />
          ))}
        </div>
      )
    }
    return (
      <EmptyNote
        title="Nothing found yet"
        graphic
        action={
          <button onClick={() => setShowImport(true)} className="btn-ghost mt-1">
            Import what you already have
          </button>
        }
      >
        Type a topic into the document and press ⌘↵. Firmo searches sixteen databases at
        once; every source you bookmark joins your works-cited page.
      </EmptyNote>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {isSearching && <StatusLine>{statusMsg}</StatusLine>}

      {results.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">
            {provisional
              ? 'First results, still ranking'
              : `${core.length} relevant`}
          </span>
          {(stanceFilter !== 'all' || hiddenSources.size > 0) && (
            <span className="record text-brand-500 dark:text-signal">{filtered.length} shown</span>
          )}
        </div>
      )}

      {/* Stance filter — only when the query actually has sides. The selected
          background is one shared element that slides between chips rather than
          five that fade, so the eye tracks the selection instead of hunting it. */}
      {stanceCounts && isArgument && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(STANCE).map(([key, cfg]) => {
            const count = stanceCounts[key] || 0
            if (count === 0) return null
            const active = stanceFilter === key
            return (
              <motion.button
                key={key}
                layout
                transition={SPRING}
                whileTap={{ scale: 0.94 }}
                onClick={() => store.setStanceFilter(active ? 'all' : key)}
                className={`relative inline-flex items-center gap-1.5 font-mono text-[9px] font-medium
                  uppercase tracking-[0.14em] px-2 py-0.5 rounded border whitespace-nowrap
                  transition-opacity ${cfg.chip} ${active ? '' : 'opacity-60 hover:opacity-100'}`}
              >
                {active && (
                  <motion.span
                    layoutId="stance-pill"
                    transition={SPRING}
                    className="absolute inset-0 rounded bg-current opacity-[0.14]"
                  />
                )}
                <span className={`relative w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className="relative">{cfg.label}</span>
                <span className="relative opacity-60">{count}</span>
              </motion.button>
            )
          })}
        </div>
      )}

      {/* Database filter */}
      {Object.keys(sourceCounts).length > 1 && (
        <details className="group">
          <summary className="eyebrow cursor-pointer list-none select-none hover:text-t2 transition-colors">
            Databases ▸
          </summary>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, count]) => {
              const hidden = hiddenSources.has(src)
              return (
                <button
                  key={src}
                  onClick={() => store.toggleSourceFilter(src)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded border transition-all ${
                    hidden
                      ? 'border-line text-t3 line-through'
                      : 'border-line text-t2 hover:border-brand-500/60 hover:text-t1'
                  }`}
                >
                  {SOURCE_LABELS[src] || src} <span className="opacity-60">{count}</span>
                </button>
              )
            })}
            {hiddenSources.size > 0 && (
              <button onClick={store.clearSourceFilters}
                className="text-[10px] font-medium text-brand-500 dark:text-signal">
                Show all
              </button>
            )}
          </div>
        </details>
      )}

      {results.length === 0 && isSearching && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {!provisional && core.length === 0 && related.length > 0 && (
        <p className="text-[11px] text-t2 leading-relaxed">
          Nothing landed squarely on your topic, but here are the closest related sources.
        </p>
      )}

      {core.map((paper, i) => (
        <SourceCard
          key={paperId(paper) || i}
          paper={paper}
          index={i}
          query={searchedQuery}
          showStance={isArgument}
        />
      ))}

      {/* Related & background: revealed only when the student asks. */}
      {!provisional && related.length > 0 && (
        <>
          {core.length > 0 && !relatedOpen && (
            <button
              onClick={() => store.setShowRelated(true)}
              className="w-full glass-quiet hover:border-hair/20 hover:bg-hair/[0.04]
                px-4 py-3 flex flex-col items-center gap-0.5 transition-colors group"
            >
              <span className="text-xs font-medium text-t1 group-hover:text-brand-600 dark:group-hover:text-signal transition-colors">
                Show {related.length} related & background
              </span>
              <span className="text-[10.5px] text-t3">Tied to your topic but not fully about it</span>
            </button>
          )}
          {relatedOpen && (
            <>
              {core.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-line">
                  <span className="eyebrow">Related & background · {related.length}</span>
                  <button onClick={() => store.setShowRelated(false)}
                    className="text-[11px] font-medium text-brand-500 dark:text-signal">Hide</button>
                </div>
              )}
              {related.map((paper, i) => (
                <SourceCard
                  key={paperId(paper) || `rel-${i}`}
                  paper={paper}
                  index={core.length + i}
                  query={searchedQuery}
                  showStance={isArgument}
                />
              ))}
            </>
          )}
        </>
      )}

      {!provisional && results.length > 0 && !error && (
        <button onClick={store.findMore} disabled={moreLoading} className="btn-ghost w-full py-2.5">
          {moreLoading ? 'Searching from new angles…' : 'Find more sources'}
        </button>
      )}
    </div>
  )
}
