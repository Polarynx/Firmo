import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import {
  CHAPTERS, SCRIPT, chapterFor, claimRun, coldStart, holdsRun, restore, snapshot, sleep,
} from '../lib/demo'
import {
  listVoices, pickVoice, prefetchLine, say, setVoice, stopSpeaking,
  usingServerVoice, warmVoices,
} from '../lib/narrate'

// ── The demo player ─────────────────────────────────────────────────────────
//
// A cursor, a caption, and a way out. Everything else on screen is the real
// workspace doing real work — see lib/demo.js for why that is the whole point.
//
// The player's only interesting decision is that it is *asynchronous rather than
// timed*. A scripted tour built on `setTimeout(step, 800)` is a stopwatch racing
// a layout: one slow spring, one wrapped line, one re-render and the cursor is
// pressing where a button used to be. So every step that names a target waits
// for that target to exist and measures it live, and the pointer travels to
// wherever it actually is. The script cannot desynchronise from the interface
// because it is reading the interface.

const CURSOR_TRAVEL = 520   // ms, and the spring below is tuned to land inside it

/**
 * Wait for an element to exist and settle, or give up.
 *
 * Polled with `setTimeout`, deliberately, not `requestAnimationFrame`. Chrome
 * stops serving animation frames entirely to a backgrounded tab, so the rAF
 * version did not merely slow down when the viewer glanced at another tab — it
 * stopped, permanently, and they came back to a demo frozen on caption one with
 * no way to tell it had died. Timers are throttled in the background rather than
 * suspended, so the script keeps its place and simply runs slower until the tab
 * is looked at again.
 */
function waitForEl(selector, timeout = 4000) {
  return new Promise(resolve => {
    const started = Date.now()
    const tick = () => {
      const el = document.querySelector(selector)
      if (el && el.getBoundingClientRect().width > 0) return resolve(el)
      if (Date.now() - started > timeout) return resolve(null)
      setTimeout(tick, 60)
    }
    tick()
  })
}

// `save-nth-2` means "the third save control in the results, wherever it landed",
// which is the only honest way to point at a list whose order is decided by a
// ranking function rather than by the script.
async function resolveTarget(at) {
  const nth = /^save-nth-(\d+)$/.exec(at)
  if (!nth) return waitForEl(`[data-demo="${at}"]`)
  await waitForEl('[data-demo^="save-"]')
  const all = document.querySelectorAll('[data-demo^="save-"]')
  return all[Number(nth[1])] || all[all.length - 1] || null
}

/**
 * Hold until the tab is actually being looked at.
 *
 * A backgrounded tab does not stop the script, it starves it: Chrome clamps
 * timers to roughly one tick a second, so a sixty-character line takes a minute
 * to type and the viewer returns to a demo apparently frozen two captions in.
 * Pausing outright is both the honest behaviour and the better one — there is no
 * reason to play a demonstration to an empty room, and none of it is missed.
 */
function whenVisible() {
  if (!document.hidden) return Promise.resolve()
  return new Promise(resolve => {
    const on = () => {
      if (document.hidden) return
      document.removeEventListener('visibilitychange', on)
      resolve()
    }
    document.addEventListener('visibilitychange', on)
  })
}

export default function Demo({ onClose }) {
  const reduceMotion = useReducedMotion()
  const [caption, setCaption] = useState('')
  const [cursor, setCursor] = useState({ x: -100, y: -100 })
  const [pressing, setPressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  // The box the cursor is currently working on, in viewport coordinates. Drives
  // the spotlight, which is the piece that makes the difference between a dot
  // wandering across a screenshot and a demonstration: the eye needs to be told
  // where to look BEFORE the thing happens, not after.
  const [spot, setSpot] = useState(null)
  const [opening, setOpening] = useState(true)
  const [chapter, setChapter] = useState('')
  // Sound is opt-out, not opt-in: a demo nobody unmutes is a demo with captions
  // and a mute button. The control is visible throughout so it is never a
  // surprise, and the captions stay on screen either way — for people with the
  // sound off, on a machine with no voices, or who simply read faster.
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  // Which voice, and what else is available. Exposed rather than decided
  // silently: voice quality is a property of the viewer's machine, the ranking
  // below can only guess, and "that one sounds wrong" is a judgement nobody
  // else can make for them.
  const [voices, setVoices] = useState([])
  const [voiceName, setVoiceName] = useState('')

  const snap = useRef(null)
  const token = useRef(0)

  useEffect(() => {
    // Taken before anything is overwritten, and only if we are not simply the
    // second half of a StrictMode double-mount stepping on our own snapshot.
    const me = claimRun()
    token.current = me
    const alive = () => holdsRun(me)
    if (!snap.current) snap.current = snapshot()
    coldStart()

    // Reduced motion gets the point without the performance: seed the finished
    // state and leave. A moving pointer the viewer did not ask for is exactly
    // the thing that setting is for.
    if (reduceMotion) {
      setCaption('Firmo, end to end.')
      setDone(true)
      return () => { claimRun() }
    }

    ;(async () => {
      // Start the pointer off the bottom edge so its first move reads as an
      // entrance rather than as a teleport.
      setCursor({ x: window.innerWidth * 0.5, y: window.innerHeight + 40 })

      // The title card. Two and a half seconds before anything moves, because a
      // demo that starts mid-gesture gives the viewer nothing to orient on and
      // they spend the first two captions working out what they are looking at.
      //
      // Gated on visibility like every step is, and for the same reason turned
      // up a level: this is the one beat that is pure orientation, so playing it
      // to a backgrounded tab does not merely waste it — the viewer comes back
      // to a demo already in motion, having missed the only frame that said what
      // they were about to watch.
      // Voices load asynchronously in Chrome, so this is done under the title
      // card where the wait is free rather than mid-sentence where it is not.
      // Fire the first line at the server while the title card is up, so the
      // opening beat plays from cache instead of waiting on a round trip.
      prefetchLine(SCRIPT.find(x => x.say)?.say)

      const v = await warmVoices()
      if (alive()) {
        setVoices(listVoices())
        setVoiceName(v?.name || '')
      }
      await whenVisible()
      if (!alive()) return
      await sleep(2200)
      setOpening(false)
      await sleep(300)

      for (let i = 0; i < SCRIPT.length && alive(); i++) {
        await whenVisible()
        if (!alive()) return
        const step = SCRIPT[i]
        setProgress((i + 1) / SCRIPT.length)
        setChapter(chapterFor(i))
        if (step.say) setCaption(step.say)

        if (step.at) {
          const el = await resolveTarget(step.at)
          if (!alive()) return
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' })
            await sleep(180)
            const r = el.getBoundingClientRect()
            // The spotlight is set at the same moment the cursor starts moving,
            // not when it arrives, so the frame reads as "here, and something is
            // on its way" rather than as a highlight appearing under a dot that
            // is already there.
            setSpot({ x: r.left, y: r.top, w: r.width, h: r.height })
            setCursor({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
            await sleep(CURSOR_TRAVEL)
            setPressing(true)
            await sleep(140)
            setPressing(false)
            // Some steps press the real control rather than calling the setter
            // behind it, so the demo exercises the product's own click handler.
            if (step.press) el.click()
          }
        } else {
          // A step with no target is Firmo talking, not the student acting.
          // Letting the spotlight linger on the last button would keep pointing
          // at something the caption has stopped being about.
          setSpot(null)
        }

        if (!alive()) return
        if (step.run) await step.run()
        if (!alive()) return

        if (step.type) {
          const { text, set, speed = 18 } = step.type
          // Typed in chunks rather than per character. One setState per keypress
          // over a 400-character paragraph is 400 renders of a growing textarea
          // with a measurement in its layout effect, which drops frames on the
          // exact screen that is meant to look effortless.
          const chunk = speed <= 8 ? 3 : 1
          for (let c = 0; c <= text.length; c += chunk) {
            if (!alive()) return
            // Backgrounded mid-sentence: stop where we are rather than dribble
            // one character a second through Chrome's timer clamp.
            if (document.hidden) { set(text); break }
            set(text.slice(0, c))
            await sleep(speed)
          }
          set(text)
        }

        // Paced against the voice, not beside it. The narration and the hold
        // used to be independent clocks, which meant a long line was still
        // being read while the cursor had already moved on to the next control
        // — the one thing that makes a narrated demo feel automated. Speaking
        // is awaited, and the hold then tops up whatever time is left, so a
        // short line still gets its beat and a long one is never cut off.
        const spokeFor = step.say ? Date.now() : 0
        if (step.say) await say(step.say, { muted: mutedRef.current })
        if (!alive()) return
        const already = spokeFor ? Date.now() - spokeFor : 0
        const remaining = (step.hold || 0) - already
        if (remaining > 0) await sleep(remaining)
      }

      if (!alive()) return
      setCaption('')
      setSpot(null)
      setDone(true)
    })()

    return () => { claimRun() }
  }, [reduceMotion])

  // Leaving puts the student's own paper back exactly as they left it.
  function finish() {
    claimRun()
    stopSpeaking()
    restore(snap.current)
    onClose()
  }

  // The ref exists because the script loop closes over its first render and
  // would otherwise keep reading `muted === false` for the whole run — pressing
  // mute would update the button and change nothing about the audio.
  useEffect(() => {
    mutedRef.current = muted
    if (muted) stopSpeaking()
  }, [muted])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') finish()
      if (e.key.toLowerCase() === 'm') setMuted(m => !m)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* A sheet of glass over the workspace. It takes every pointer event, so
          nothing the viewer does can fight the script, and it is otherwise
          invisible: the interface underneath is the thing being shown. */}
      {/* The glass only holds while the script is actually running.
          It hides the real pointer so there are not two cursors on screen, and
          it swallows clicks so nothing the viewer does can fight the script.
          Both of those are wrong the moment the run ends: the closing card has a
          button on it, and a workspace you can see but cannot point at reads as
          a frozen application. So once `done` it stops taking events and gives
          the cursor back, and the only thing still on top is the card itself. */}
      <div
        className={`fixed inset-0 z-[60] ${done ? 'pointer-events-none' : ''}`}
        style={done ? undefined : { cursor: 'none' }}
        onClick={e => { if (!done) e.preventDefault() }}
      />

      {/* The spotlight.
          A rounded frame that travels between targets rather than one that fades
          out here and in over there — `layout`-free, just an animated box, so it
          reads as a single lens being moved. It is drawn with a very large
          outward shadow rather than a mask over the page: a real mask would dim
          the interface, and the interface is the thing being demonstrated. This
          only lifts the target out of it. */}
      <AnimatePresence>
        {spot && !opening && (
          <motion.div
            key="spot"
            className="fixed z-[61] pointer-events-none rounded-lg"
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{
              opacity: 1, scale: 1,
              left: spot.x - 8, top: spot.y - 6,
              width: spot.w + 16, height: spot.h + 12,
            }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 190, damping: 24 }}
            style={{
              border: '1px solid rgb(var(--accent) / 0.55)',
              boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.28), 0 0 30px -4px rgb(var(--accent) / 0.45)',
            }}
          />
        )}
      </AnimatePresence>

      {/* The pointer. A ring rather than an arrow — an arrow drawn over a real
          cursor's territory reads as a broken cursor, a ring reads as a
          spotlight, which is what this is. */}
      {/* The ghost goes when the run does, or the viewer gets their own cursor
          back and a second one still floating beside it. */}
      {!reduceMotion && !done && (
        <motion.div
          className="fixed z-[62] pointer-events-none"
          animate={{ x: cursor.x, y: cursor.y }}
          transition={{ type: 'spring', stiffness: 90, damping: 18, mass: 0.9 }}
          style={{ top: 0, left: 0 }}
        >
          <motion.span
            animate={pressing ? { scale: 0.55 } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            className="block -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full
              border-2 border-brand-500 dark:border-signal"
            style={{ background: 'rgb(var(--accent) / 0.18)' }}
          />
          {/* The press leaves a ripple, so a click is visible even when the
              thing it lands on has no hover state of its own. */}
          <AnimatePresence>
            {pressing && (
              <motion.span
                initial={{ scale: 0.4, opacity: 0.7 }}
                animate={{ scale: 2.6, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="absolute inset-0 -translate-x-1/2 -translate-y-1/2 w-6 h-6
                  rounded-full border border-brand-500 dark:border-signal"
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* One caption at a time, at the foot of the screen, out of the way of the
          thing it is describing. Not a card: a card would cover the interface
          the demo exists to show. */}
      <div className="fixed inset-x-0 bottom-0 z-[63] pointer-events-none
        flex flex-col items-center gap-3 pb-6 px-4">
        {/* A keyed remount, not an AnimatePresence with `mode="wait"`. That
            version makes each caption wait for the previous one's exit to report
            finished, and it does not always report: captions six through eleven
            of this script simply never appeared, on a screen whose entire job is
            to be watched. Nothing in a demo may hang on an animation. */}
        {caption && (
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="glass max-w-[54ch] text-center px-5 py-3 text-[13.5px]
              text-t1 leading-relaxed"
          >
            {caption}
          </motion.p>
        )}

        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="glass pointer-events-auto flex flex-col items-center gap-3 px-7 py-6"
            >
              <h2 className="font-display font-semibold text-2xl text-t1 text-center">
                Every claim, <span className="display-italic font-normal">accounted for.</span>
              </h2>
              <button onClick={finish} className="btn-primary text-xs">
                Start your own paper
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Always available, never in the way. A tour you cannot leave is a
          modal wearing a costume. */}
      {/* Bottom right, not top right: the masthead already has five controls in
          that corner and the skip button landed on top of them. */}
      <div className="fixed bottom-5 right-5 z-[64] flex items-center gap-2">
        {!done && !usingServerVoice() && voices.length > 1 && (
          // A picker, not a setting. Windows ships two generations of voice at
          // once and the good ones are network-backed, so which of them a given
          // machine has is unknowable from here — this shows the actual list and
          // lets the ear decide. Changing it speaks a line immediately, because
          // choosing a voice from a dropdown of names is choosing blind.
          <select
            value={voiceName}
            onChange={e => {
              const v = voices.find(x => x.name === e.target.value)
              setVoice(v)
              setVoiceName(e.target.value)
              if (!mutedRef.current) say('Right — let us take it from the top.', { muted: false })
            }}
            title="Which voice reads the demo"
            className="glass max-w-[190px] px-2.5 py-1.5 text-[11.5px] font-medium text-t2
              hover:text-t1 transition-colors outline-none cursor-pointer"
          >
            {voices.map(v => (
              <option key={v.name} value={v.name}>
                {v.name.replace(/^Microsoft /, '').replace(/ Online \(Natural\)/, ' ·')
                       .replace(/ - English \(([^)]+)\)/, ' ($1)')}
              </option>
            ))}
          </select>
        )}
        {!done && (
          <button
            onClick={() => setMuted(m => !m)}
            aria-pressed={muted}
            title={muted ? 'Turn the narration on' : 'Turn the narration off'}
            className="glass px-3 py-1.5 text-[11.5px] font-medium text-t2 hover:text-t1
              transition-colors"
          >
            {muted ? 'Sound off' : 'Sound on'}
            <span className="opacity-50 font-mono ml-1.5">m</span>
          </button>
        )}
        <button
          onClick={finish}
          className="glass px-3 py-1.5 text-[11.5px] font-medium text-t2 hover:text-t1
            transition-colors"
        >
          {done ? 'Close' : 'Skip'} <span className="opacity-50 font-mono ml-1">esc</span>
        </button>
      </div>

      {/* How far through, as one hairline across the top — with a tick at each
          chapter boundary, so the bar says how much is left in *parts* rather
          than as a fraction nobody can size. A viewer deciding whether to sit
          through the rest is asking "how many more of these", and seven ticks
          answers it where 0.62 does not. */}
      <div className="fixed inset-x-0 top-0 z-[64] h-[3px] pointer-events-none">
        <motion.div
          className="h-full bg-brand-500 dark:bg-signal origin-left"
          animate={{ scaleX: progress }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ width: '100%' }}
        />
        {CHAPTERS.map(c => (
          <span
            key={c.at}
            aria-hidden="true"
            className="absolute top-0 h-full w-px bg-app/70"
            style={{ left: `${c.at * 100}%` }}
          />
        ))}
      </div>

      {/* Which chapter, named. The captions describe the individual action; this
          says which part of making a paper the action belongs to, which is the
          thing a viewer is actually trying to learn. */}
      {!opening && !done && chapter && (
        <motion.div
          key={chapter}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[64] pointer-events-none
            record !text-[9px] tracking-[0.22em] px-3 py-1 rounded-full
            bg-app/80 backdrop-blur-sm border border-hair/10"
        >
          {chapter}
        </motion.div>
      )}

      {/* The title card. Two and a half seconds of nothing but the promise,
          before a single thing moves. A demo that opens mid-gesture spends its
          first two captions being decoded rather than watched. */}
      <AnimatePresence>
        {opening && !reduceMotion && (
          <motion.div
            key="opening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.7, ease: 'easeInOut' } }}
            className="fixed inset-0 z-[65] flex flex-col items-center justify-center
              gap-4 bg-app pointer-events-none"
          >
            <motion.span
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="eyebrow"
            >
              Firmo, end to end
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="font-display font-semibold text-[2.4rem] sm:text-[3rem]
                leading-[1.02] text-t1 text-center max-w-[16ch]"
            >
              A question to a finished paper,{' '}
              <span className="display-italic font-normal">in one minute.</span>
            </motion.h1>
            <motion.span
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.6 }}
              className="record"
            >
              Nothing here is a mock-up
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
