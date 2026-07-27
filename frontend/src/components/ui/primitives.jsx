import { motion } from 'framer-motion'
import { SPRING } from '../../lib/constants'

/** A status pill: dot, label, optional count. The workspace's only badge. */
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
      <div className="skeleton h-2.5 w-24" />
      <div className="skeleton h-3.5 w-full" />
      <div className="skeleton h-3.5 w-2/3" />
      <SkeletonLines lines={2} />
    </div>
  )
}

/** A live status line. Pulsing dot, never a spinner. */
export function StatusLine({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 text-xs text-t2 ${className}`} aria-live="polite">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-signal animate-pulseDot shrink-0" />
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
    <div className="rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3.5 py-3
      flex items-center justify-between gap-3">
      <p className="text-xs text-red-600 dark:text-red-300 leading-relaxed">{children}</p>
      {onRetry && <button onClick={onRetry} className="btn-ghost shrink-0">Retry</button>}
    </div>
  )
}

/** Empty state: a quiet instruction, never a dead panel. */
export function EmptyNote({ title, children, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="rounded-lg border border-dashed border-line px-4 py-6 flex flex-col items-center
        gap-2 text-center"
    >
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
      className={`p-1.5 rounded-md transition-colors ${
        active ? 'text-t1 bg-raised' : 'text-t3 hover:text-t1 hover:bg-raised/70'
      } ${className}`}
    >
      {children}
    </button>
  )
}
