/**
 * A quietly rotating 3D dossier — a small stack of source pages catching the light,
 * the top one bearing Firmo's serif monogram and a gold reading-ribbon. Pure CSS
 * transforms (no dependency), theme-aware, and it holds still for reduced-motion.
 * It's the "from blank page to bibliography" idea, made into an object.
 */
export default function HeroEmblem({ className = '' }) {
  return (
    <div className={`hero-emblem ${className}`} aria-hidden="true">
      <div className="emblem-float">
        <div className="emblem-spin">
          {/* pages fanned behind the cover */}
          <div className="emblem-page emblem-page--3" />
          <div className="emblem-page emblem-page--2" />
          {/* cover page: monogram, ruled "text", brand spine + gold ribbon */}
          <div className="emblem-page emblem-page--1">
            <span className="emblem-mono">F</span>
            <span className="emblem-rule" />
            <span className="emblem-rule emblem-rule--short" />
            <span className="emblem-rule" />
            <span className="emblem-rule emblem-rule--short" />
            <span className="emblem-ribbon" />
          </div>
        </div>
      </div>
      <div className="emblem-floor" />
    </div>
  )
}
