import { API } from './api'

// ── The voice ───────────────────────────────────────────────────────────────
//
// Captions ask the viewer to read the screen and watch the screen at once, and
// the screen is the point. A voice frees the eyes.
//
// Web Speech, not a recorded file: a VO would be better in every way except the
// one that matters, in that it would go stale the moment a line of script
// changed, and the discipline of this demo is that nothing in it can drift from
// the product without breaking visibly.
//
// The hard part is that voice quality is a property of the viewer's machine.
// Windows ships two generations at once and they are not close:
//
//   SAPI5 (David, Mark, Zira, Hazel)  — local, instant, and audibly a robot.
//   "Online (Natural)" (Guy, Ryan, Libby, Aria) — Azure neural, genuinely good.
//
// The first version of this file ranked by accent first, which on a typical
// Windows install means the only en-GB voice present is Libby — natural, and
// female — while the male voices available are the robotic local ones. Asking
// for "British male" and getting "British female" or "American robot" is a
// choice the ranking was making silently.
//
// So it scores instead of ordering, and the weights say what was actually
// wanted: never robotic, then male, then British. An American neural voice is a
// better demo than a British synthesiser from 2005.

const PREFERRED_GB_MALE = [
  'ryan',    // Microsoft Ryan Online (Natural) — en-GB male, the target
  'thomas',
  'george',
  'alfie',
  'elliot',
  'oliver',
  'daniel',  // macOS / iOS en-GB male
  'arthur',
]

// Neural male voices worth taking when no British male exists.
const PREFERRED_ANY_MALE = ['guy', 'brandon', 'christopher', 'eric', 'roger', 'steffan', 'alex']

const FEMALE = /aria|libby|sonia|zira|hazel|susan|serena|kate|fiona|karen|moira|tessa|samantha|hayley|heather|priya|jenny|michelle|ana|amber|ashley|cora|elizabeth|monica|nanami/i
const MALE = /guy|ryan|thomas|george|alfie|elliot|oliver|daniel|arthur|david|mark|brandon|christopher|eric|roger|steffan|alex|james|william|liam|brian/i

// Azure neural voices announce themselves. These are the ones that do not sound
// like a station announcement.
const NATURAL = /online|natural|neural|premium|enhanced|siri/i

function score(v) {
  const name = (v.name || '').toLowerCase()
  const lang = (v.lang || '').toLowerCase()
  if (!lang.startsWith('en')) return -1

  let s = 0
  // Not robotic, above everything. This is the complaint that actually lands:
  // an accent mismatch is a nitpick, a 2005 synthesiser is unlistenable.
  if (NATURAL.test(name)) s += 100
  // Male, next.
  if (PREFERRED_GB_MALE.some(n => name.includes(n))) s += 40
  else if (PREFERRED_ANY_MALE.some(n => name.includes(n))) s += 34
  else if (MALE.test(name) && !FEMALE.test(name)) s += 26
  else if (FEMALE.test(name)) s -= 20
  // British, last — the nice-to-have.
  if (lang.startsWith('en-gb')) s += 12
  else if (lang.startsWith('en-au') || lang.startsWith('en-ie')) s += 4
  // Google's voices beat local SAPI even without the Natural marker.
  if (name.startsWith('google')) s += 20
  return s
}

let cached
let override = null

/** Every English voice this browser has, best first. Drives the picker. */
export function listVoices() {
  const voices = window.speechSynthesis?.getVoices?.() || []
  return voices
    .filter(v => (v.lang || '').toLowerCase().startsWith('en'))
    .map(v => ({ voice: v, score: score(v) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.voice)
}

/** The chosen voice: whatever the viewer picked, else the best scoring one. */
export function pickVoice() {
  if (override) return override
  if (cached) return cached
  const ranked = listVoices()
  return (cached = ranked[0] || null)
}

export function setVoice(v) {
  override = v || null
}

/**
 * Voices load asynchronously in Chrome — `getVoices()` returns empty on the
 * first call and fires `voiceschanged` later, so asking once and playing silent
 * is the predictable result of not waiting. The network voices in particular
 * arrive a beat after the local ones, which is exactly the set worth waiting
 * for.
 */
export function warmVoices(timeout = 2500) {
  return new Promise(resolve => {
    const synth = window.speechSynthesis
    if (!synth) return resolve(null)
    let done = false
    const finish = () => {
      if (done) return
      done = true
      synth.removeEventListener('voiceschanged', finish)
      cached = undefined
      resolve(pickVoice())
    }
    synth.addEventListener('voiceschanged', finish)
    // Even with voices already present, give the network set a moment to land.
    if (synth.getVoices().some(v => NATURAL.test(v.name))) finish()
    else setTimeout(finish, timeout)
  })
}

/**
 * Speak one line. Resolves when it finishes, or immediately when speech is
 * unavailable — callers await this to pace against the voice, so it must never
 * hang.
 */
// ── The recorded voice ──────────────────────────────────────────────────────
//
// Web Speech is the fallback now, not the plan.
//
// The script is eighteen fixed lines. They do not change between visitors, so
// synthesising them per-visitor was always slightly absurd — a live API call, a
// key, a quota and a round trip, to produce a byte-identical result every time.
// `scripts/render_narration.py` renders them once with edge-tts as
// en-GB-RyanNeural, the young British male the script was written for, and the
// MP3s are committed. Every visitor hears the same take, instantly, with no key
// and nothing to run.
//
// `manifest.json` maps each line to its file. A line whose text has been edited
// simply is not in the manifest — the filename is a hash of the text — so it
// falls through to Web Speech rather than playing the wrong audio, and
// `--check` fails in CI until it is re-rendered.
let manifest = null      // null = not loaded, {} = loaded and empty
let serverVoice = null   // null = untested, true/false = known

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

// ── Softening the seams ─────────────────────────────────────────────────────
//
// Each line is its own MP3, and an MP3 starts and stops at full volume. Played
// back to back that is audible as a click at every join, and across a dozen
// lines it is the difference between a recording and a sequence of files. A
// short ramp at each end costs nothing and removes it.
//
// Done with WebAudio rather than by animating `el.volume`, because volume steps
// in discrete jumps and a fade built from setTimeouts is its own kind of
// stutter. The graph is built once and reused; browsers cap how many
// AudioContexts a page may open, and a demo that creates one per line will
// eventually get none.
const FADE = 0.11   // seconds at each end

let ctx = null
let gain = null

function graph() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'auto'
    audioEl.crossOrigin = 'anonymous'
  }
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      gain = ctx.createGain()
      ctx.createMediaElementSource(audioEl).connect(gain)
      gain.connect(ctx.destination)
    } catch {
      // No WebAudio, or the element is already routed through a graph. Playing
      // unfaded is a worse demo, not a broken one.
      ctx = false
    }
  }
  return ctx || null
}

function player() {
  graph()
  return audioEl || (audioEl = Object.assign(new Audio(), { preload: 'auto' }))
}

/** Ramp in from silence, and schedule the ramp out to land on the last frame. */
function fade(el) {
  if (!ctx || !gain) return
  try {
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(1, now + FADE)

    // The duration is only known once metadata has loaded, which for a cached
    // file is usually already true and occasionally is not.
    const scheduleOut = () => {
      const d = el.duration
      if (!isFinite(d) || d <= FADE * 2) return
      const end = ctx.currentTime + (d - el.currentTime)
      gain.gain.setValueAtTime(1, end - FADE)
      gain.gain.linearRampToValueAtTime(0.0001, end)
    }
    if (isFinite(el.duration)) scheduleOut()
    else el.addEventListener('loadedmetadata', scheduleOut, { once: true })
  } catch {}
}

/** Play one line from a URL. Resolves false if it cannot. */
function playUrl(url, { recorded = false } = {}) {
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
    el.onerror = () => { if (!recorded) serverVoice = false; done(false) }
    // A line is a few seconds; anything past this is a stall, and the caller
    // still has the browser voice to fall back to.
    setTimeout(() => done(false), 20000)

    el.src = url
    el.play().then(
      () => { fade(el); if (!recorded) serverVoice = true },
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

async function sayInternal(text, { muted, rate }) {
  if (muted || !text) return

  // Recorded first: identical for everyone, no request, no quota.
  const url = await recordedUrl(text)
  if (url && await playUrl(url, { recorded: true })) return

  // Then a configured TTS endpoint, if the deployment has one.
  if (serverVoice !== false
      && await playUrl(`${API}/api/narrate?text=${encodeURIComponent(text)}`)) return

  // Then whatever the machine has.
  return sayViaBrowser(text, { muted, rate })
}

function sayViaBrowser(text, { muted = false, rate = 1.06 } = {}) {
  return new Promise(resolve => {
    if (muted || !window.speechSynthesis || !text) return resolve()

    // No voice installed at all — headless Chrome, stripped Linux images, some
    // locked-down corporate builds. `speechSynthesis` still exists and `speak()`
    // still accepts the utterance; it just never fires `onend`, so every line
    // would sit on the timeout below and a sixty-second demo would take four
    // minutes. Return immediately and let the captions carry it.
    const voice = pickVoice()
    if (!voice) return resolve()

    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.voice = voice
      u.lang = voice.lang || 'en-GB'
      // Neural voices carry a faster read than synthesisers do; 1.0 on a good
      // voice sounds like someone being careful with you.
      u.rate = rate
      u.pitch = 1.0
      u.volume = 1

      let settled = false
      const done = () => { if (!settled) { settled = true; resolve() } }
      u.onend = done
      u.onerror = done
      // Chrome drops `onend` often enough that awaiting it alone will stall a
      // run outright. Roughly words-per-second, with headroom.
      setTimeout(done, Math.min(14000, 1800 + text.length * 55))

      window.speechSynthesis.speak(u)
    } catch {
      resolve()
    }
  })
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel() } catch {}
  try {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0 }
  } catch {}
}

/** True when a real recorded/served voice is reading, rather than the browser. */
export function usingServerVoice() {
  return serverVoice === true || !!(manifest && Object.keys(manifest.lines || {}).length)
}
