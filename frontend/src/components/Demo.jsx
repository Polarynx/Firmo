import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { useUIStore } from '../stores/useUIStore'
import {
  claimRun, coldStart, holdsRun, isFullTour, readingTime, restore, snapshot, sleep, tourFor,
} from '../lib/demo'
import { prefetchLine, say, stopSpeaking } from '../lib/narrate'
import { setDemoActive } from '../lib/demoMode'

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
function waitForEl(selector, timeout = 1600) {
  return new Promise(resolve => {
    const started = Date.now()
    const tick = () => {
      const el = document.querySelector(selector)
      if (el && el.getBoundingClientRect().width > 0) return resolve(el)
      // Giving up quickly matters more than giving up late. A target that is
      // not on this stage is a scripting mistake, and the cost of one should be
      // a beat that does not point at anything — not four seconds of a frozen
      // cursor while the viewer wonders what broke.
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

export default function Demo({ onClose, stage = 'question' }) {
  // Captured on the first render and never re-read. The survey drives the stage
  // around as it plays, so following the live value would mean the tour changed
  // underneath itself the moment it navigated anywhere.
  const launchedFrom = useRef(stage).current

  // Which tour, decided by the room the button was pressed in. The home tab
  // gets the full survey; every other tab gets its own short one about what is
  // actually on that screen.
  const SCRIPT = useMemo(() => tourFor(launchedFrom), [launchedFrom])
  const full = isFullTour(SCRIPT)
  const reduceMotion = useReducedMotion()
  const [caption, setCaption] = useState('')
  const [cursor, setCursor] = useState({ x: -100, y: -100 })
  const [pressing, setPressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  // Where the walkthrough button is, so the closing card can point at it. The
  // last thing a demo should leave behind is "how do I see that again" — the
  // answer is one icon in the masthead and nobody would find it unaided.
  const [anchor, setAnchor] = useState(null)

  const snap = useRef(null)
  const token = useRef(0)

  useEffect(() => {
    // Taken before anything is overwritten, and only if we are not simply the
    // second half of a StrictMode double-mount stepping on our own snapshot.
    const me = claimRun()
    token.current = me
    const alive = () => holdsRun(me)
    if (!snap.current) snap.current = snapshot()
    // The survey starts from nothing, because it is showing someone what
    // starting a paper looks like. A focused tour runs against whatever the
    // student already has — they opened it mid-paper to ask about this screen,
    // and clearing their work to answer would be a strange reply.
    if (full) coldStart()

    // Reduced motion gets the point without the performance: seed the finished
    // state and leave. A moving pointer the viewer did not ask for is exactly
    // the thing that setting is for.
    if (reduceMotion) {
      setCaption('Firmo, end to end.')
      setDone(true)
      return () => { claimRun() }
    }

    // Kill focus outlines for the duration.
    //
    // The demo presses real controls, and a pressed button keeps :focus-visible
    // — which index.css draws as a 2px accent outline — so the run left a trail
    // of ringed buttons behind it, each looking like something the viewer was
    // still meant to be looking at. Blurring after the click was the obvious
    // fix and an unreliable one: React re-renders, framer-motion re-mounts, and
    // anything that takes focus back does so after the blur. Suppressing the
    // style outright cannot be raced.
    document.documentElement.classList.add('demo-running')
    // Every control the tour presses now answers from canned data instead of
    // the network, so nothing it demonstrates can fail or cost a request.
    setDemoActive(true)

    ;(async () => {
      // Start the pointer off the bottom edge so its first move reads as an
      // entrance rather than as a teleport.
      setCursor({ x: window.innerWidth * 0.5, y: window.innerHeight + 40 })

      // Straight in. There used to be a two-second title card here and it was
      // the part of the run worth cutting: a viewer who pressed play has
      // already decided to watch, and holding a logo in front of them is time
      // spent proving nothing.
      // Warm the first line while nothing is happening yet.
      prefetchLine(SCRIPT.find(x => x.say)?.say)

      await whenVisible()
      if (!alive()) return
      await sleep(250)

      for (let i = 0; i < SCRIPT.length && alive(); i++) {
        await whenVisible()
        if (!alive()) return
        const step = SCRIPT[i]
        setProgress((i + 1) / SCRIPT.length)
        if (step.say) setCaption(step.say)

        // Voice and visuals start together, so the line is read while the
        // pointer travels to the thing it is about. Awaiting it at the end of
        // the step instead was what made the whole run feel like a series of
        // pauses.
        const voice = step.say
          ? say(step.say).then(() => sleep(200))
          : Promise.resolve()


        if (step.at) {
          const el = await resolveTarget(step.at)
          if (!alive()) return
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' })
            await sleep(180)
            const r = el.getBoundingClientRect()
            setCursor({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
            await sleep(CURSOR_TRAVEL)
            setPressing(true)
            await sleep(140)
            setPressing(false)
            // Some steps press the real control rather than calling the setter
            // behind it, so the demo exercises the product's own click handler.
            if (step.press) {
              el.click()
              // Otherwise the button keeps the focus ring after the pointer has
              // moved on, and the demo leaves a trail of outlined controls
              // behind it — every one of them looking like something the viewer
              // is meant to still be looking at.
              try { el.blur() } catch {}
            }
          }
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

        // Wait for the voice, which has been playing underneath the visuals
        // since the top of the step. Falls back to reading time when there is no
        // recording for a line — an edited caption is simply absent from the
        // manifest rather than playing the wrong words.
        if (!alive()) return
        await voice
        if (!alive()) return
        if (step.hold) await sleep(step.hold)
      }

      if (!alive()) return
      setCaption('')
      const btn = document.querySelector('[data-demo-anchor="walkthrough"]')
      if (btn) {
        const r = btn.getBoundingClientRect()
        setAnchor({ x: r.left + r.width / 2, y: r.bottom })
      }
      setDone(true)
    })()

    return () => {
      claimRun()
      setDemoActive(false)
      document.documentElement.classList.remove('demo-running')
    }
  }, [reduceMotion, full])

  // Leaving puts the student's own paper back exactly as they left it.
  function finish() {
    claimRun()
    setDemoActive(false)
    document.documentElement.classList.remove('demo-running')
    stopSpeaking()
    // Everything the tour touched goes back, and the student lands on the tab
    // they pressed the button in — with their own paper on it. A walkthrough
    // that returns you somewhere else has cost you your place to explain
    // itself.
    restore(snap.current)
    useUIStore.getState().setStage(launchedFrom)
    onClose()
  }

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
              <p className="text-[12.5px] text-t2 text-center max-w-[42ch] leading-relaxed">
                {full
                  ? 'Your own paper is exactly where you left it.'
                  : 'Back to your paper — nothing here was changed.'}
              </p>
              <button onClick={finish} className="btn-primary text-xs">
                {full ? 'Start your own paper' : 'Back to work'}
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
        <button
          onClick={finish}
          className="glass px-3 py-1.5 text-[11.5px] font-medium text-t2 hover:text-t1
            transition-colors"
        >
          {done ? 'Close' : 'Skip'} <span className="opacity-50 font-mono ml-1">esc</span>
        </button>
      </div>

      {/* How far through, as one hairline across the top.
          The chapter ticks that used to sit on it are gone with the chapter
          labels: they were scaffolding for a demo that did not flow, telling
          the viewer which section they were in because the run itself did not
          make that obvious. It does now, and a table of contents over a
          ninety-second film is one more thing competing with the screen. The
          bar stays — "how much longer" is a fair question — as one quiet rule
          rather than a structure. */}
      <div className="fixed inset-x-0 top-0 z-[64] h-[3px] pointer-events-none">
        <motion.div
          className="h-full bg-brand-500 dark:bg-signal origin-left"
          animate={{ scaleX: progress }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ width: '100%' }}
        />
      </div>


      {/* Where to find this again.
          A demo that ends without saying how to replay it has taught someone
          something and then hidden the way back to it. The arrow is drawn from
          the closing card to the actual button, measured live rather than
          positioned by hand, so it keeps pointing at the right place when the
          masthead reflows. */}
      <AnimatePresence>
        {done && anchor && (
          <motion.div
            key="anchor"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 26 }}
            className="fixed z-[64] pointer-events-none flex flex-col items-center"
            style={{ left: anchor.x - 90, top: anchor.y + 6, width: 180 }}
          >
            <motion.span
              aria-hidden="true"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              className="text-brand-500 dark:text-signal text-lg leading-none"
            >
              ▲
            </motion.span>
            <span className="mt-1 glass px-2.5 py-1.5 text-[11px] font-medium text-t1 text-center">
              Watch this again here
            </span>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  )
}
