import { useEffect, useRef, useState } from 'react'

// Text that arrives rather than appears.
//
// Two very different sources feed this. The chat streams token by token, and
// the research brief lands in one lump — both should read as Firmo thinking
// aloud. So the reveal is decoupled from delivery: it always chases the end of
// the string, and the further behind it falls the faster it moves, which means
// a long brief catches up in about a second instead of crawling.
//
// The loop stops itself once caught up, so an idle card costs nothing.

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default function StreamingText({
  text = '',
  className = '',
  caret = false,
  as: Tag = 'p',
}) {
  const instant = prefersReducedMotion()
  const [shown, setShown] = useState(() => (instant ? text.length : 0))
  const [seen, setSeen] = useState(text)
  const shownRef = useRef(shown)

  // Adjusting state during render, the pattern React sanctions for deriving
  // from props. A replaced string restarts the reveal; an extended one keeps
  // its place, so streaming deltas never rewind what the reader has read.
  if (text !== seen) {
    setSeen(text)
    if (!text.startsWith(seen)) {
      shownRef.current = 0
      setShown(0)
    }
  }

  useEffect(() => {
    if (instant) {
      shownRef.current = text.length
      setShown(text.length)
      return
    }
    let frame = requestAnimationFrame(function tick() {
      const remaining = text.length - shownRef.current
      if (remaining <= 0) return // caught up: let the loop die
      shownRef.current += Math.max(2, Math.ceil(remaining / 16))
      setShown(shownRef.current)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [text, instant])

  const visible = text.slice(0, Math.min(shown, text.length))

  return (
    <Tag className={className}>
      {visible}
      {caret && visible.length < text.length && (
        <span className="stream-caret" aria-hidden="true" />
      )}
    </Tag>
  )
}
