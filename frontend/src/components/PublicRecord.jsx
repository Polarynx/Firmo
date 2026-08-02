import { useEffect, useState } from 'react'

import { API } from '../lib/api'

// The shared process record, as an instructor sees it.
//
// This page is the deliverable. Everything else in Firmo exists to help a
// student write a paper; this is the thing they hand over alongside it, so it
// is set as a document — masthead, rule, ledger, colophon — and not as an app
// screen. No navigation, no account, no product chrome: the reader arrived from
// a link in a submission and wants one question answered.
//
// It deliberately does not show the draft. The record proves the process, not
// the prose, and an instructor opening a link should not be handed an essay
// they were not given.

const LABEL = {
  'search.run': 'Searched',
  'search.expand': 'Followed citations',
  'source.open': 'Opened a source',
  'source.save': 'Saved a source',
  'source.remove': 'Removed a source',
  'import.run': 'Imported references',
  'draft.snapshot': 'Draft saved',
  'draft.check': 'Checked the draft',
  'claim.flagged': 'Claim needs a source',
  'claim.resolved': 'Claim backed',
  'citation.insert': 'Inserted a citation',
  'citations.audit': 'Audited references',
  'chat.turn': 'Asked Firmo',
  'chat.refusal': 'Firmo declined to write',
  'export.docx': 'Exported the paper',
}

// The server redacts the student's own words on this route — quoted sentences,
// search queries, chat turns — and sends "[redacted]" in their place. Printing
// that string inside quotation marks would read as a bug, so the placeholder is
// recognised and turned into a statement about the event instead. A reader
// should see that a search happened and be unable to read it, which is a
// different thing from seeing something broken.
const REDACTED = '[redacted]'
const kept = v => (typeof v === 'string' && v && v !== REDACTED ? v : null)

function detailOf(ev) {
  const p = ev.payload || {}
  if (kept(p.query)) return `"${p.query}"`
  if (kept(p.title)) return p.title
  if (kept(p.asked)) return `"${p.asked}"`
  if (p.words != null) return `${p.words} words`
  if (p.query === REDACTED || p.asked === REDACTED) return 'withheld'
  return ''
}

function stamp(ts) {
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function PublicRecord({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API}/api/record/public/${token}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => {
        setData(d)
        // The tab is part of the artefact: an instructor with six submissions
        // open should be able to tell them apart without clicking through.
        document.title = d.title
          ? `Process record — ${d.title}`
          : 'Process record — Firmo'
      })
      .catch(() => setError('This link is not active. Ask for a new one.'))
  }, [token])

  if (error) {
    return (
      <main className="min-h-full grid place-items-center px-6 bg-app text-t1">
        <p className="text-[14px] text-t2">{error}</p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="min-h-full grid place-items-center px-6 bg-app text-t1">
        <p className="record">Loading the record…</p>
      </main>
    )
  }

  const events = data.events || []
  const refusals = events.filter(e => e.kind === 'chat.refusal').length
  const saved = events.filter(e => e.kind === 'source.save').length
  const searches = events.filter(e => e.kind === 'search.run').length
  const ok = data.verification?.ok

  return (
    <main className="min-h-full overflow-y-auto bg-app text-t1">
      <div className="mx-auto w-full max-w-2xl px-6 py-14 flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <span className="eyebrow">Firmo · process record</span>
          <div className="masthead-rule pb-4">
            <h1 className="font-display font-semibold text-[2.4rem] leading-[1.05] text-t1">
              {data.title || 'Untitled paper'}
            </h1>
            {data.author && (
              <p className="text-[14px] text-t2 mt-1">{data.author}</p>
            )}
          </div>

          <p className="text-[14px] text-t2 leading-relaxed max-w-[54ch]">
            Every search, source, and revision below was logged automatically while this
            paper was written. Firmo does not write prose — when it was asked to, it
            declined, and those refusals are in the log.
          </p>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-hair/10
          border border-hair/10 rounded-control overflow-hidden">
          {[
            ['Searches', searches],
            ['Sources saved', saved],
            ['Entries', events.length],
            ['Refusals', refusals],
          ].map(([label, value]) => (
            <div key={label} className="bg-panel px-4 py-3 flex flex-col gap-0.5">
              <span className="font-display font-semibold text-[24px] tabular-nums leading-none">
                {value}
              </span>
              <span className="record">{label}</span>
            </div>
          ))}
        </section>

        <section className="rounded-control border px-4 py-3 flex flex-col gap-1"
          style={{
            borderColor: ok ? 'rgb(var(--accent) / 0.35)' : 'rgba(248, 113, 113, 0.35)',
          }}>
          <span className={`text-[13px] font-medium ${
            ok ? 'text-brand-600 dark:text-signal' : 'text-annot-red'
          }`}>
            {ok
              ? `Chain intact across all ${data.verification.checked} entries`
              : `Chain breaks at entry ${data.verification?.broken_at} — ${data.verification?.reason}`}
          </span>
          <p className="text-[12px] text-t2 leading-relaxed">
            Each entry is hashed together with the one before it. Changing an entry after
            the fact breaks every entry that follows it, which makes editing detectable.
            It does not make it impossible: Firmo hosts this record, so treat it as
            evidence of process, not as proof against a determined forger.
          </p>
        </section>

        <section className="flex flex-col">
          <span className="eyebrow pb-2">The log</span>
          <ol className="flex flex-col">
            {events.map(ev => (
              <li key={ev.seq}
                className="grid grid-cols-[2.4rem_1fr] gap-x-4 py-2.5
                  border-b border-hair/[0.07]">
                <span className="record tabular-nums pt-[3px]">
                  {String(ev.seq).padStart(3, '0')}
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-[13px] font-medium ${
                      ev.kind === 'chat.refusal' ? 'text-annot-red'
                        : ev.kind === 'source.save' || ev.kind === 'claim.resolved'
                          || ev.kind === 'citation.insert'
                          ? 'text-brand-600 dark:text-signal'
                          : 'text-t1'
                    }`}>
                      {LABEL[ev.kind] || ev.kind}
                    </span>
                    <span className="record shrink-0">{stamp(ev.at)}</span>
                  </div>
                  {detailOf(ev) && (
                    <p className="text-[12px] text-t2 leading-snug break-words">
                      {detailOf(ev)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="flex flex-col gap-1 pt-2">
          <span className="record break-all">chain head · {data.head}</span>
          <span className="record">
            shared {data.shared_at ? stamp(data.shared_at) : '—'} · recorded by Firmo
          </span>
        </footer>
      </div>
    </main>
  )
}
