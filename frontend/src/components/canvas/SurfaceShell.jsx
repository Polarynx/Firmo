// The frame every non-document stage is set in.
//
// Each surface used to be a sidebar panel three hundred pixels wide, and moving
// them into the centre without a common frame would have produced seven
// differently-margined screens. This gives them one measure, one heading style,
// and one place the eye starts. The document is deliberately not in here: a page
// with a section heading printed above it is not a page.

export default function SurfaceShell({ eyebrow, title, aside, children, wide = false }) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} px-8 pt-10 pb-56
      flex flex-col gap-6`}>
      {(title || eyebrow) && (
        <header className="flex items-end justify-between gap-4 flex-wrap
          pb-3 border-b border-hair/10">
          <div className="flex flex-col gap-1 min-w-0">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && (
              <h1 className="font-display font-semibold text-[1.7rem] leading-tight text-t1">
                {title}
              </h1>
            )}
          </div>
          {aside && <div className="shrink-0 flex items-center gap-2">{aside}</div>}
        </header>
      )}
      {children}
    </div>
  )
}
