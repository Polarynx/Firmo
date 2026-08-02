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
// ── The good voice, when the server has one ─────────────────────────────────
//
// Web Speech is the fallback now, not the plan. `/api/narrate` returns the same
// line read by Azure's en-GB-RyanNeural — the young British male the script was
// written for — so every visitor hears the identical take instead of whatever
// their machine happens to have installed.
//
// Probed once. If narration is not configured the endpoint answers 503, this
// flips to false for the session, and nothing tries again: a demo that pauses
// on a doomed request before every line is worse than one that never had a
// server voice at all.
let serverVoice = null   // null = untested, true/false = known

let audioEl = null

function player() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'auto'
  }
  return audioEl
}

/** Fetch and play one line from the server. Resolves false if it cannot. */
function sayViaServer(text) {
  return new Promise(resolve => {
    if (serverVoice === false) return resolve(false)
    const el = player()
    const url = `${API}/api/narrate?text=${encodeURIComponent(text)}`

    let settled = false
    const done = ok => {
      if (settled) return
      settled = true
      el.onended = el.onerror = el.oncanplaythrough = null
      resolve(ok)
    }

    el.onended = () => done(true)
    el.onerror = () => { serverVoice = false; done(false) }
    // A line is a few seconds; anything past this is a stall, and the caller
    // still has the browser voice to fall back to.
    setTimeout(() => done(serverVoice === true), 20000)

    el.src = url
    el.play().then(
      () => { serverVoice = true },
      // Autoplay refusal, not a server problem — the demo is opened by a click,
      // so this is rare, and falling through to Web Speech is the right answer
      // either way.
      () => done(false),
    )
  })
}

/** Warm the first line so the demo does not open on a network round trip. */
export function prefetchLine(text) {
  if (!text || serverVoice === false) return
  try { fetch(`${API}/api/narrate?text=${encodeURIComponent(text)}`).catch(() => {}) } catch {}
}

export function say(text, { muted = false, rate = 1.06 } = {}) {
  return sayInternal(text, { muted, rate })
}

async function sayInternal(text, { muted, rate }) {
  if (muted || !text) return
  if (serverVoice !== false && await sayViaServer(text)) return
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

/** True once the server voice has answered at least one line. Drives the UI. */
export function usingServerVoice() {
  return serverVoice === true
}
