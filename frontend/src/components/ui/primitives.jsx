import { motion } from 'framer-motion'
import { SPRING } from '../../lib/constants'

/** A status pill: dot, label, optional count. The workspace's smallest badge. */
export function Chip({ tone, label, count, title, className = '' }) {
  if (!tone) return null
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase
        tracking-[0.14em] px-2 py-0.5 rounded border whitespace-nowrap ${tone.chip} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
      {label ?? tone.label}
      {count != null && <span className="opacity-60">{count}</span>}
    </span>
  )
}

/**
 * A shortcut rendered as a physical key rather than as text. Pass the glyphs
 * as children; each `Keycap` is one key, so a chord is two of them.
 */
export function Keycap({ children, className = '' }) {
  return <kbd className={`keycap ${className}`}>{children}</kbd>
}

/** A live indicator: solid core, expanding ring. Only shown when something is
 *  genuinely happening, so it never becomes wallpaper. */
export function LED({ live = true }) {
  return (
    <span className="led" aria-hidden="true">
      {live && <span className="led-ping" />}
      <span
        className="led-core"
        style={live ? undefined : { background: 'rgb(var(--c-t3))' }}
      />
    </span>
  )
}

/**
 * A rounded status control. Renders as a button when given `onClick`, so the
 * things you can change and the things you can only read stay distinguishable
 * by behaviour rather than by styling.
 */
export function Pill({ children, onClick, title, live, className = '', ...rest }) {
  const content = (
    <>
      {live != null && <LED live={live} />}
      {children}
    </>
  )
  if (!onClick) {
    return <span className={`pill ${className}`} title={title} {...rest}>{content}</span>
  }
  return (
    <button onClick={onClick} title={title} className={`pill ${className}`} {...rest}>
      {content}
    </button>
  )
}

/**
 * How closely a source matched the topic, on the same 0–1 scale the ranker
 * uses. Shown as a bar plus the number: the bar is scannable down a column of
 * cards, the number is what the student quotes to themselves.
 */
export function Confidence({ value, label = 'match', className = '' }) {
  if (value == null || Number.isNaN(value)) return null
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <div className="confidence-track w-12 shrink-0" role="img"
        aria-label={`${pct} percent ${label}`}>
        <motion.div
          className="confidence-fill w-full"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="font-mono text-[9.5px] text-t3 tabular-nums shrink-0">
        {pct}% {label}
      </span>
    </div>
  )
}

/** The database a record came from, stamped like a catalogue mark. */
export function Stamp({ code, title, className = '' }) {
  if (!code) return null
  return <span className={`stamp ${className}`} title={title}>{code}</span>
}

/** A light travelling the top edge of a zone. Our only loading indicator. */
export function EdgeProgress({ active }) {
  return active ? <div className="edge-progress" aria-hidden="true" /> : null
}

/** Skeleton wave, for content that will arrive in a known shape. */
export function SkeletonLines({ lines = 3, className = '' }) {
  const widths = ['w-full', 'w-5/6', 'w-4/6', 'w-3/4']
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skeleton h-3 ${widths[i % widths.length]}`} />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="skeleton h-[18px] w-8 rounded" />
        <div className="skeleton h-2.5 w-20" />
      </div>
      <div className="skeleton h-3.5 w-full" />
      <div className="skeleton h-3.5 w-2/3" />
      <SkeletonLines lines={2} />
    </div>
  )
}

/** A live status line. Pulsing LED, never a spinner. */
export function StatusLine({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 text-xs text-t2 ${className}`} aria-live="polite">
      <LED />
      {children}
    </div>
  )
}

/** Section heading inside a panel. */
export function PanelHeading({ children, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="eyebrow">{children}</span>
      {action}
    </div>
  )
}

export function ErrorNote({ children, onRetry }) {
  if (!children) return null
  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3.5 py-3
      flex items-center justify-between gap-3">
      <p className="text-xs text-red-600 dark:text-red-300 leading-relaxed">{children}</p>
      {onRetry && <button onClick={onRetry} className="btn-ghost shrink-0">Retry</button>}
    </div>
  )
}

/**
 * A citation network drawing itself: nodes connecting to a centre, which is
 * exactly the shape the panel is about to fill with. Used instead of a dashed
 * box, which reads as a broken upload field rather than as an invitation.
 */
export function CitationGraph({ className = '' }) {
  const nodes = [
    { x: 26,  y: 30, d: 0 },
    { x: 108, y: 18, d: 0.5 },
    { x: 166, y: 52, d: 1.0 },
    { x: 22,  y: 78, d: 1.5 },
    { x: 92,  y: 92, d: 2.0 },
    { x: 160, y: 96, d: 2.5 },
  ]
  const cx = 94
  const cy = 56
  return (
    <svg
      viewBox="0 0 188 112"
      className={`w-full max-w-[188px] h-auto ${className}`}
      aria-hidden="true"
      fill="none"
    >
      {nodes.map((n, i) => (
        <line
          key={`e${i}`}
          x1={cx} y1={cy} x2={n.x} y2={n.y}
          stroke="rgb(var(--accent))"
          strokeWidth="1"
          className="edge-draw"
          style={{ animationDelay: `${n.d * 0.28}s` }}
        />
      ))}
      {nodes.map((n, i) => (
        <circle
          key={`n${i}`}
          cx={n.x} cy={n.y} r="2.4"
          fill="rgb(var(--accent))"
          className="node-pulse"
          style={{ animationDelay: `${n.d * 0.35}s` }}
        />
      ))}
      {/* The centre is the student's own topic: filled, not hollow. */}
      <circle cx={cx} cy={cy} r="6" fill="rgb(var(--accent) / 0.16)" />
      <circle cx={cx} cy={cy} r="3.2" fill="rgb(var(--accent))" />
    </svg>
  )
}

/** Empty state: a quiet instruction on a real surface, never a dead panel. */
export function EmptyNote({ title, children, action, graphic = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="glass-quiet px-5 py-6 flex flex-col items-center gap-3 text-center"
    >
      {graphic && <CitationGraph className="mb-1 opacity-90" />}
      {title && <p className="text-sm font-medium text-t1">{title}</p>}
      <p className="text-xs text-t2 leading-relaxed max-w-[34ch]">{children}</p>
      {action}
    </motion.div>
  )
}

export function IconButton({ label, onClick, active, children, className = '' }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-lg transition-colors ${
        active ? 'text-t1 bg-raised' : 'text-t3 hover:text-t1 hover:bg-raised/80'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * Groups the utility icons into one frosted control rather than leaving them
 * loose on the chrome, so the top bar reads as two objects instead of six.
 */
export function IconCluster({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-0.5 p-0.5 rounded-xl bg-panel/70
      border border-hair/10 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  )
}
