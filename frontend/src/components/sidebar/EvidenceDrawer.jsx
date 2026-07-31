import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { API } from '../../lib/api'
import { authToken } from '../../stores/useAuthStore'
import { useSavedSources } from '../../stores/selectors'
import { SPRING, roleFor } from '../../lib/constants'

// ── The evidence drawer ─────────────────────────────────────────────────────
//
// The passage that actually backs a claim, on the page it appears on.
//
// Everywhere else in Firmo a "source" is a title, an abstract and a relevance
// score — a recommendation. This is the one place the student sees the sentence
// itself, which is the difference between "this paper is about your topic" and
// "page 8 says the thing you just wrote".
//
// It is rendered as paper: a light surface, serif type, the page number set in
// the margin the way a running head is. That is the only light surface in the
// dark workspace, and deliberately so — evidence is an exhibit pulled out of
// the archive, not another panel of the application. It makes the theme a
// narrative device rather than a preference.

export default function EvidenceDrawer({ claim, projectId }) {
  const [state, setState] = useState({ status: 'idle', passages: [], corpusSize: 0 })
  const [open, setOpen] = useState(null)
  const savedSources = useSavedSources()

  // The corpus keys passages by DOI (or a hash of the title), which is not the
  // id the saved-source list uses, so the role is recovered by matching the two
  // the way a librarian would: same DOI, or failing that the same title.
  const roleOf = passage => {
    const doi = (passage.source_key || '').toLowerCase()
    const title = (passage.title || '').trim().toLowerCase()
    const hit = savedSources.find(s => {
      const sDoi = (s.doi || '').trim().toLowerCase()
      if (sDoi && doi && sDoi === doi) return true
      return !!title && (s.title || '').trim().toLowerCase() === title
    })
    return hit?.stance ? roleFor(hit.stance, hit.shape) : null
  }

  const text = (claim?.claim || claim?.quote || '').trim()
  const signedIn = !!authToken()

  useEffect(() => {
    if (!text || !projectId || !signedIn) return
    let cancelled = false
    setState(s => ({ ...s, status: 'loading' }))
    fetch(`${API}/api/corpus/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ project_id: projectId, claim: text, top_k: 3 }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => {
        if (cancelled) return
        setState({
          status: 'ready',
          passages: d.passages || [],
          corpusSize: d.corpus_size || 0,
        })
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', passages: [], corpusSize: 0 }) })
    return () => { cancelled = true }
  }, [text, projectId, signedIn])

  // Nothing to say yet is better said with nothing. This panel appears only
  // once the project has papers read into it and one of them bears on the
  // claim; an empty "no evidence found" box on every claim would train the
  // student to ignore the whole region.
  if (!signedIn || state.status !== 'ready' || state.passages.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">In the papers you have read</span>
        <span className="record">{state.corpusSize} passages</span>
      </div>

      {state.passages.map((p, i) => {
        const isOpen = open === i
        const role = roleOf(p)
        return (
          <motion.div
            key={`${p.source_key}-${p.page}-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: i * 0.05 }}
            className="rounded-control overflow-hidden border border-hair/10"
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full text-left px-3 py-2 flex items-baseline justify-between gap-3
                bg-hair/[0.03] hover:bg-hair/[0.06] transition-colors"
            >
              <span className="flex items-baseline gap-1.5 min-w-0">
                {/* Which way this paper cuts, carried over from the search that
                    found it. A passage that backs the claim and one that
                    complicates it look identical otherwise, and the difference
                    is the whole reason to read the second one. */}
                {role && (
                  <span title={role.label}
                    className={`w-1.5 h-1.5 rounded-full shrink-0 self-center ${role.dot}`} />
                )}
                <span className="text-[11.5px] text-t1 truncate">{p.title || 'Saved paper'}</span>
              </span>
              <span className="record shrink-0">page {p.page}</span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="sheet"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  {/* The exhibit. Fixed paper colours rather than themed
                      surfaces: this is meant to read as a photocopied page in
                      both themes, not as another panel that follows the app. */}
                  <div className="grid grid-cols-[2.2rem_1fr] gap-x-2 px-3 py-3"
                    style={{ background: '#F7F5F0', color: '#1A1613' }}>
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em]
                      pt-[5px] text-right" style={{ color: '#8C8379' }}>
                      p.&thinsp;{p.page}
                    </span>
                    <p className="font-display text-[13px] leading-relaxed">
                      {p.text}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}
