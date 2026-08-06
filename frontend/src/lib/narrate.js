import { readingTime } from './demo'

// ── The recorded voice ──────────────────────────────────────────────────────
//
// Web Speech is the fallback now, not the plan.
//
// The script is a fixed set of lines — the full tour plus one per room. They do
// not change between visitors, so synthesising them per-visitor was always
// slightly absurd — a live API call, a key, a quota and a round trip, to produce
// a byte-identical result every time. `scripts/render_narration.py` renders them
// once with edge-tts and commits the MP3s. Every visitor hears the same take,
// instantly, with no key and nothing to run.
//
// The voice and its tuning live in that script, not here; it is the one place
// that decides how Firmo sounds, and this file only plays what it produced.
//
// `manifest.json` maps each line to its file. A line whose text has been edited
// simply is not in the manifest — the filename is a hash of the text — so it
// falls through to Web Speech rather than playing the wrong audio, and
// `--check` fails in CI until it is re-rendered.
let manifest = null      // null = not loaded, {} = loaded and empty

async function loadManifest() {
  if (manifest) return manifest
  try {
    const res = await fetch('/narration/manifest.json', { cache: 'force-cache' })
    manifest = res.ok ? await res.json() : {}
  } catch {
    manifest = {}
  }
  return manifest
}

/** The recorded file for a line, or null when it has none. */
async function recordedUrl(text) {
  const m = await loadManifest()
  const file = m?.lines?.[text]
  return file ? `/narration/${file}` : null
}

let audioEl = null

function player() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'auto'
  }
  return audioEl
}

/** Play one line. Resolves false if it cannot. */
function playUrl(url) {
  return new Promise(resolve => {
    const el = player()

    let settled = false
    const done = ok => {
      if (settled) return
      settled = true
      el.onended = el.onerror = el.oncanplaythrough = null
      resolve(ok)
    }

    el.onended = () => done(true)
    el.onerror = () => done(false)
    // A line is a few seconds; anything past this is a stall, and the caller
    // still has the browser voice to fall back to.
    setTimeout(() => done(false), 20000)

    el.src = url
    el.play().then(
      () => {},
      // Autoplay refusal, not a server problem — the demo is opened by a click,
      // so this is rare, and falling through to Web Speech is the right answer
      // either way.
      () => done(false),
    )
  })
}

/** Warm the manifest and the first line, under the title card. */
export function prefetchLine(text) {
  loadManifest().then(async () => {
    const url = text && await recordedUrl(text)
    if (url) { try { fetch(url, { cache: 'force-cache' }).catch(() => {}) } catch {} }
  })
}

export function say(text, { muted = false, rate = 1.06 } = {}) {
  return sayInternal(text, { muted, rate })
}

async function sayInternal(text, { muted }) {
  if (muted || !text) return

  const url = await recordedUrl(text)
  if (url && await playUrl(url)) return

  // No recording for this line: it has been edited since the last render, so
  // the filename no longer matches. Hold for as long as it would take to read
  // rather than racing past a caption nobody has had time to finish.
  await new Promise(r => setTimeout(r, readingTime(text)))

  // Nothing else. A synthesised fallback was tried and it sounded like a
  // different product every time — better silent captions than a robot reading
  // over your interface.
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel() } catch {}
  try {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0 }
  } catch {}
}

/** True when a real recorded/served voice is reading, rather than the browser. */
export function hasVoice() {
  return !!(manifest && Object.keys(manifest.lines || {}).length)
}
