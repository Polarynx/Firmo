import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

import { useUIStore } from '../../stores/useUIStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { SPRING } from '../../lib/constants'
import StreamingText from '../ui/StreamingText'

// A reply that left the bar and became an object on the desk. Drag it out of
// the way, drag it onto the document to keep it, or dismiss it.
//
// What lands in the document is a plan, never prose: the chat endpoint refuses
// to write the paper, so the worst a drop can do is give the student their own
// outline back in their own file.

export default function PopoverCard({ card }) {
  const closePopover = useUIStore(s => s.closePopover)
  const appendToDoc = useWorkspaceStore(s => s.appendToDoc)
  const [dropping, setDropping] = useState(false)
  const [inserted, setInserted] = useState(false)
  const bodyRef = useRef(null)

  function insert() {
    if (!card.body?.trim()) return
    appendToDoc(card.body.trim())
    setInserted(true)
    setTimeout(() => closePopover(card.id), 500)
  }

  // Released over the canvas? Treat it as a drop into the document.
  function handleDragEnd(_e, info) {
    setDropping(false)
    const zone = document.getElementById('zone-a')
    if (!zone || !card.body?.trim() || card.streaming) return
    const r = zone.getBoundingClientRect()
    const { x, y } = info.point
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) insert()
  }

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.08}
      onDragStart={() => setDropping(true)}
      onDragEnd={handleDragEnd}
      // The entrance animates opacity and scale only. Declaring x/y here would
      // hand framer-motion two owners for the same motion values, and every
      // re-render would spring the card back out from under the cursor.
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: inserted ? 0.9 : 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
      transition={SPRING}
      whileDrag={{ scale: 1.02, rotate: -0.6, cursor: 'grabbing' }}
      className={`glass pointer-events-auto w-[330px] max-h-[46vh] flex flex-col overflow-hidden
        ${dropping ? 'ring-1 ring-brand-500/60' : ''}`}
    >
      <div className="shrink-0 flex items-start justify-between gap-2 px-3.5 pt-3 pb-2 cursor-grab active:cursor-grabbing">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="eyebrow">Ask your sources</span>
          <p className="text-[11.5px] font-medium text-t1 leading-snug line-clamp-2">{card.title}</p>
        </div>
        <button
          onClick={() => closePopover(card.id)}
          className="shrink-0 text-t3 hover:text-t1 transition-colors text-xs leading-none p-1"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto scroll-quiet px-3.5 pb-2">
        {card.body ? (
          <StreamingText
            text={card.body}
            caret={card.streaming}
            className="text-[12px] text-t1 leading-relaxed whitespace-pre-wrap"
          />
        ) : (
          <p className="text-[12px] text-t3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 dark:bg-signal animate-pulseDot" />
            Reading your sources…
          </p>
        )}
      </div>

      {card.body && !card.streaming && (
        <div className="shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-t border-line">
          <button onClick={insert} className="btn-ghost">
            {inserted ? '✓ Added' : 'Add to document'}
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(card.body)}
            className="text-[11px] font-medium text-t3 hover:text-t1 transition-colors"
          >
            Copy
          </button>
          <span className="ml-auto text-[10px] text-t3">or drag onto the page</span>
        </div>
      )}
    </motion.div>
  )
}
