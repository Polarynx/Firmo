// Pinning claims to the document, and reading the student's intent from what
// they typed or pasted. Both are pure functions over the canvas text so the
// stores and the editor can share them without a round trip.

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Locate a quote in the draft: exact match first, then a whitespace-tolerant
// regex so a quote the model re-spaced still finds its sentence.
export function findQuote(text, quote, from = 0) {
  if (!quote) return null
  const idx = text.indexOf(quote, from)
  if (idx >= 0) return [idx, idx + quote.length]
  const words = quote.trim().split(/\s+/).map(escapeRe)
  if (words.length === 0) return null
  try {
    const re = new RegExp(words.join('[\\s\\u00A0]+'), 'g')
    re.lastIndex = from
    const m = re.exec(text)
    if (m) return [m.index, m.index + m[0].length]
  } catch { /* bad pattern → treat as not found */ }
  return null
}

// Pin every claim to a character span, skipping spans already taken so two
// claims never fight over the same sentence. Unpinned claims get start: -1 and
// are listed in the sidebar instead of highlighted.
export function placeClaims(text, claims) {
  const used = []
  return claims.map(c => {
    let span = findQuote(text, c.quote)
    while (span && used.some(([s, e]) => span[0] < e && span[1] > s)) {
      span = findQuote(text, c.quote, span[0] + 1)
    }
    if (!span) return { ...c, start: -1, end: -1 }
    used.push(span)
    return { ...c, start: span[0], end: span[1] }
  })
}

// Map a coach status onto the four annotation colours the canvas paints.
export const MARK_CLASS = {
  needs_citation: 'mark-amber',
  shaky: 'mark-red',
  backed: 'mark-green',
  cited: 'mark-green',
  rewritten: 'mark-green',
  fine: 'mark-dotted',
  unchecked: 'mark-dotted',
  checking: 'mark-pending',
}

// ── Intent detection ───────────────────────────────────────────────────────
// One surface, three jobs. Rather than making the student pick a tool, read
// what they gave us: a line is a research topic, a bibliography is a list of
// records, and everything longer is a draft to be coached.

const REFERENCE_SIGNALS = [
  /\(\d{4}[a-z]?\)/,                    // (2019)
  /\b10\.\d{4,9}\/\S+/,                 // a DOI
  /\bdoi:/i,
  /\bet al\.?/i,
  /\bpp?\.\s?\d+/i,
  /\bvol\.\s?\d+/i,
  /\bretrieved from\b/i,
  /^[A-Z][a-zA-Z'’-]+,\s+[A-Z]\./, // Surname, I.
]

function looksLikeReference(line) {
  const l = line.trim()
  if (l.length < 25) return false
  return REFERENCE_SIGNALS.filter(re => re.test(l)).length >= 2
}

/**
 * Classify the canvas contents.
 * Returns 'empty' | 'search' | 'citations' | 'draft'.
 */
export function detectIntent(text) {
  const t = (text || '').trim()
  if (!t) return 'empty'

  const lines = t.split('\n').map(l => l.trim()).filter(Boolean)
  const words = t.split(/\s+/).length

  // A single short line with no terminal punctuation is a topic, not prose.
  if (lines.length === 1 && words <= 25 && t.length <= 220) {
    return looksLikeReference(t) ? 'citations' : 'search'
  }

  // A works-cited page: most lines individually read as bibliographic records.
  if (lines.length >= 2) {
    const refs = lines.filter(looksLikeReference).length
    if (refs >= 2 && refs / lines.length >= 0.6) return 'citations'
  }

  return 'draft'
}

export const INTENT_COPY = {
  search: {
    verb: 'Find sources',
    hint: 'Reads like a topic. Firmo will search 16 databases and brief you.',
  },
  draft: {
    verb: 'Check draft',
    hint: 'Reads like a draft. Firmo will highlight every claim that needs backing.',
  },
  citations: {
    verb: 'Verify citations',
    hint: 'Reads like a reference list. Firmo will check every entry against publisher records.',
  },
}

// ── What kind of question this looks like ───────────────────────────────────
//
// The server classifies the question properly — it has the whole prompt and a
// model — but that answer only arrives after the search has run, which is far
// too late to be useful to someone still deciding what to type. This is the
// cheap client-side read of the same thing, shown while they type.
//
// It is deliberately conservative and deliberately hedged in the copy ("reads
// like"). Guessing wrong is survivable when the line is phrased as an
// impression; it would not be if this claimed to be the verdict. The order
// matters: a comparison wearing "to what extent" is still a comparison, and an
// interpretive question about a text is not a measurement no matter how it
// opens.
const SHAPE_HINTS = [
  {
    shape: 'comparison',
    test: t => /\b(rather than|versus|vs\.?|as opposed to|compared with|compared to)\b/.test(t)
      || /\bprimarily\b.*\bthan\b/.test(t),
    hint: 'Reads like a question of which explanation. Firmo will look for the case on both sides.',
  },
  {
    shape: 'interpretive',
    test: t => /\b(ethical|moral|justice|ought|legitimac|normative|narrative|fiction|novel|poem|rhetoric|discourse|historiograph|philosoph)\w*/.test(t),
    hint: 'Reads like a question of interpretation. Firmo will look for readings and the theory behind them.',
  },
  {
    shape: 'enumeration',
    test: t => /^\s*(what are|what were|which are)\b/.test(t)
      || /\b(factors|limits|implications|vulnerabilit|barriers|causes of|arguments (for|against))\b/.test(t),
    hint: 'Reads like a question of coverage. The answer is a list, and Firmo will hunt for what a keyword search would miss.',
  },
  {
    shape: 'mechanism',
    test: t => /^\s*(how did|how do|how does|in what ways)\b/.test(t),
    hint: 'Reads like a question of mechanism. Firmo will look for the pathways, not a verdict.',
  },
  {
    shape: 'extent',
    test: t => /\b(to what extent|how much|how effective|how far|how strongly)\b/.test(t),
    hint: 'Reads like a question of degree. Firmo will look for effect sizes and null results, not a yes or no.',
  },
]

/** A guess at the question's shape, or null when nothing fits confidently. */
export function guessShape(text) {
  const t = (text || '').trim().toLowerCase()
  if (t.length < 12 || t.split(/\s+/).length < 4) return null
  return SHAPE_HINTS.find(h => h.test(t)) || null
}
