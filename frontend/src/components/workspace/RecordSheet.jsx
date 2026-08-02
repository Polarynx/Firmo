import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import { API } from '../../lib/api'
import { flush } from '../../lib/record'
import { authToken } from '../../stores/useAuthStore'
import { useRecordStore } from '../../stores/useRecordStore'
import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { SPRING_SOFT } from '../../lib/constants'

// The process record, read in full.
//
// This is the artefact the whole product argues for, so it is presented as a
// document rather than as a settings panel: a masthead, a verification line, a
// ledger, and the chain head printed at the foot like a colophon. It should
// look like something a student would be willing to hand to an instructor.
//
// The honesty of the verification line matters more than its reassurance. It
// says tamper-evident, not tamper-proof, and when the chain does not add up it
// says exactly which entry broke rather than showing a red badge and leaving
// the reader to guess.

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

/** The one detail worth showing beside each entry. */
function detailOf(ev) {
  const p = ev.payload || {}
  if (p.query) return `"${p.query}"`
  if (p.title) return p.title
  if (p.asked) return `"${p.asked}"`
  if (p.chars != null) return `${p.words ?? '—'} words`
  if (p.doi) return `doi:${p.doi}`
  return ''
}

function stamp(ts) {
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function RecordSheet({ onClose }) {
  const projectId = useWorkspaceStore(s => s.activeProjectId)
  const projectName = useWorkspaceStore(
    s => s.projects.find(p => p.id === s.activeProjectId)?.name || 'This paper')
  const localEvents = useRecordStore(s => s.events)

  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [shareToken, setShareToken] = useState(null)
  const [copied, setCopied] = useState(false)

  const signedIn = !!authToken()
  const mine = localEvents.filter(e => e.projectId === projectId)

  useEffect(() => {
    if (!signedIn || !projectId) return
    let cancelled = false
    setLoading(true)
    // Flush first: a record read a second after the work was done should
    // include that work, not lag four seconds behind it.
    flush()
      .then(() => fetch(`${API}/api/record/${projectId}`, {
        headers: { Authorization: `Bearer ${authToken()}` },
      }))
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return
        setServer(data)
        setShareToken(data.share_token || null)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [signedIn, projectId])

  // The server's chain is authoritative; the local log is what to show until
  // there is one.
  const entries = server?.events?.length
    ? server.events.map(e => ({ kind: e.kind, at: e.at, payload: e.payload, seq: e.seq }))
    : mine.map((e, i) => ({ ...e, seq: i + 1 }))

  const refusals = entries.filter(e => e.kind === 'chat.refusal').length
  const saved = entries.filter(e => e.kind === 'source.save').length
  const searches = entries.filter(e => e.kind === 'search.run').length
  const verification = server?.verification

  async function share() {
    const res = await fetch(`${API}/api/record/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ project_id: projectId, title: projectName }),
    })
    if (res.ok) setShareToken((await res.json()).token)
  }

  async function revoke() {
    await fetch(`${API}/api/record/unshare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ project_id: projectId }),
    })
    setShareToken(null)
  }

  const shareUrl = shareToken ? `${window.location.origin}/record/${shareToken}` : ''

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex justify-end"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={SPRING_SOFT}
        className="h-full w-full max-w-[560px] bg-panel border-l border-hair/10
          flex flex-col"
      >
        <div className="px-6 pt-6 pb-4 border-b border-hair/10 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="eyebrow">Process record</span>
              <h2 className="font-display font-semibold text-[22px] text-t1 mt-1.5 leading-tight">
                {projectName}
              </h2>
            </div>
            <button onClick={onClose} className="btn-ghost shrink-0">Close</button>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 record">
            <span>{searches} search{searches === 1 ? '' : 'es'}</span>
            <span>{saved} source{saved === 1 ? '' : 's'} saved</span>
            <span className={refusals ? 'text-annot-red' : ''}>
              {refusals} refusal{refusals === 1 ? '' : 's'}
            </span>
            <span>{entries.length} entries</span>
          </div>
        </div>

        {!signedIn && (
          <div className="mx-6 mt-4 rounded-control border border-hair/10 bg-hair/[0.03] px-4 py-3">
            <p className="text-[12.5px] text-t2 leading-relaxed">
              You are working signed out, so this record lives only in this browser and
              cannot be verified or shared. Sign in and everything below is kept, chained,
              and shareable — including the work you have already done.
            </p>
          </div>
        )}

        {signedIn && verification && (
          <div className="mx-6 mt-4 rounded-control border px-4 py-3 flex flex-col gap-1"
            style={{
              borderColor: verification.ok
                ? 'rgb(var(--accent) / 0.35)'
                : 'rgba(248, 113, 113, 0.35)',
            }}>
            <span className={`text-[12.5px] font-medium ${
              verification.ok ? 'text-brand-600 dark:text-signal' : 'text-annot-red'
            }`}>
              {verification.ok
                ? `Chain intact across all ${verification.checked} entries`
                : `Chain breaks at entry ${verification.broken_at} — ${verification.reason}`}
            </span>
            <p className="text-[11.5px] text-t2 leading-relaxed">
              Each entry is hashed together with the one before it, so an entry cannot be
              changed after the fact without breaking every entry after it. This makes
              editing detectable, not impossible.
            </p>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto scroll-quiet px-6 py-4">
          {loading && <p className="record">Loading the record…</p>}

          {!loading && entries.length === 0 && (
            <p className="text-[13px] text-t2 leading-relaxed">
              Nothing recorded yet. Run a search or save a source and it appears here.
            </p>
          )}

          <ol className="flex flex-col">
            {entries.map(ev => (
              <li key={`${ev.seq}-${ev.at}`}
                className="grid grid-cols-[2.2rem_1fr] gap-x-3 py-2 border-b border-hair/[0.06]">
                <span className="record tabular-nums pt-[3px]">
                  {String(ev.seq).padStart(3, '0')}
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-[12.5px] font-medium ${
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
                    <p className="text-[11.5px] text-t2 leading-snug truncate">{detailOf(ev)}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="shrink-0 border-t border-hair/10 px-6 py-4 flex flex-col gap-3">
          {/* What a link actually publishes, said before it is minted rather
              than in a help page nobody opens. Sharing your process record is a
              genuinely irreversible act — you cannot un-see a URL — and the
              person pressing this is usually a student handing evidence to an
              instructor, which is precisely the moment to be exact about what
              leaves. Firmo redacts the quoted sentences and search queries on
              the public route; this says so, because "trust us" is not a
              privacy policy. */}
          {signedIn && !shareToken && (
            <div className="flex flex-col gap-2.5">
              <div className="rounded-lg border border-hair/10 bg-hair/[0.03] px-3.5 py-3
                flex flex-col gap-1.5">
                <span className="eyebrow">A link would show</span>
                <p className="text-[11.5px] text-t2 leading-relaxed">
                  Every step, in order, with its timestamp and the hash chain that proves
                  nothing was edited — searches run, sources saved, claims flagged and backed,
                  and every time Firmo refused to write.
                </p>
                <span className="eyebrow !text-t3 pt-1">and would not show</span>
                <p className="text-[11.5px] text-t2 leading-relaxed">
                  Your draft, the sentences you quoted, or what you typed into the search box.
                  Those are redacted for anyone but you.
                </p>
              </div>
              <button onClick={share} className="btn-primary self-start">
                Create a shareable link
              </button>
            </div>
          )}

          {shareToken && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Anyone with this link can read the record</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-record border border-hair/10
                  bg-hair/[0.04] px-2.5 py-1.5 font-mono text-[11px] text-t2">
                  {shareUrl}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1600)
                  }}
                  className="btn-ghost shrink-0"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={revoke} className="btn-ghost shrink-0">Revoke</button>
              </div>
            </div>
          )}

          {/* The colophon: the chain head, printed the way a press mark is. */}
          {server?.head && (
            <p className="record break-all leading-relaxed">
              chain head · {server.head}
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
