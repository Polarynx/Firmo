// ── The voice ───────────────────────────────────────────────────────────────
//
// Captions ask the viewer to read the screen and watch the screen at the same
// time, and the screen is the point — every second spent on a line of text at
// the bottom is a second not spent watching a citation land in a sentence. A
// voice frees the eyes.
//
// Web Speech, not an audio file. A recorded VO would be better in every way
// except the one that matters: it would be a fixed artefact that goes stale the
// moment a caption changes, and the entire discipline of this demo is that
// nothing in it can drift from the product without breaking visibly. Synthesis
// reads whatever the script currently says.
//
// The cost is that voice availability is a property of the viewer's machine,
// not of this code. There is no British male voice guaranteed anywhere, so this
// asks for one, settles for the nearest thing, and falls back to silence with
// captions still on screen. Nothing about the demo depends on the audio
// arriving.

const WANT_LANG = 'en-GB'

// Ordered by how close each is to the brief — a young, warm, British male.
// Names differ per platform and none is guaranteed, so this is a preference
// list rather than a lookup.
const PREFERRED = [
  'Google UK English Male',   // Chrome, and the closest to the brief
  'Daniel',                   // macOS / iOS en-GB male
  'Microsoft Ryan Online',    // Edge en-GB male, natural
  'Microsoft Thomas',         // Edge en-GB male
  'Arthur',                   // macOS en-GB
  'Oliver',
]

const AVOID = /female|zira|hazel|susan|serena|kate|fiona|karen|moira|tessa|samantha/i

let cached = null

/** The best available voice for the brief, or null if the browser has none. */
export function pickVoice() {
  if (cached !== undefined && cached !== null) return cached
  const voices = window.speechSynthesis?.getVoices?.() || []
  if (!voices.length) return null

  for (const name of PREFERRED) {
    const hit = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()))
    if (hit) return (cached = hit)
  }
  // Any en-GB that is not obviously a female voice.
  const gb = voices.filter(v => v.lang?.toLowerCase().startsWith('en-gb'))
  const male = gb.find(v => !AVOID.test(v.name))
  if (male) return (cached = male)
  if (gb.length) return (cached = gb[0])

  // No British voice at all. An American one reading British-written copy is a
  // worse result than an accent mismatch: it is the wrong register for lines
  // like "accounted for". Still better than silence, so it is taken last.
  const en = voices.find(v => v.lang?.toLowerCase().startsWith('en') && !AVOID.test(v.name))
  return (cached = en || voices[0] || null)
}

/**
 * Voices load asynchronously in Chrome — `getVoices()` returns an empty array
 * on first call and fires `voiceschanged` later. A demo that asks once, gets
 * nothing, and plays silently on every first visit is the predictable result of
 * not waiting.
 */
export function warmVoices(timeout = 1500) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) return resolve(null)
    if (window.speechSynthesis.getVoices().length) return resolve(pickVoice())
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.speechSynthesis.removeEventListener('voiceschanged', finish)
      resolve(pickVoice())
    }
    window.speechSynthesis.addEventListener('voiceschanged', finish)
    setTimeout(finish, timeout)
  })
}

/**
 * Speak one line. Resolves when it finishes, or immediately if speech is
 * unavailable — callers await this to pace themselves against the voice, so it
 * must never hang.
 *
 * The 12-second ceiling is not defensive padding. Chrome drops `onend` on the
 * floor often enough that a demo awaiting it will simply stop mid-run, and a
 * stalled demo is worse than an unnarrated one.
 */
export function say(text, { muted = false } = {}) {
  return new Promise(resolve => {
    if (muted || !window.speechSynthesis || !text) return resolve()

    // No voice installed at all — headless Chrome, a stripped Linux image, some
    // locked-down corporate builds. `speechSynthesis` still exists and `speak()`
    // still accepts the utterance; it just never fires `onend`, so every
    // narrated line would sit on the 12-second timeout below and a sixty-second
    // demo would take four minutes. Return immediately and let the captions
    // carry it.
    const voice = pickVoice()
    if (!voice) return resolve()

    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.voice = voice
      u.lang = voice?.lang || WANT_LANG
      // Slightly slower than default and a touch above neutral pitch: the brief
      // is young and friendly, and synthesis at rate 1.0 reads as a station
      // announcement.
      u.rate = 0.96
      u.pitch = 1.06
      u.volume = 1

      let settled = false
      const done = () => { if (!settled) { settled = true; resolve() } }
      u.onend = done
      u.onerror = done
      setTimeout(done, 12000)

      window.speechSynthesis.speak(u)
    } catch {
      resolve()
    }
  })
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel() } catch {}
}
