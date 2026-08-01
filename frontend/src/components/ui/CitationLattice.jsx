import { useEffect, useRef } from 'react'

import { useUIStore } from '../../stores/useUIStore'

// ── The citation lattice ────────────────────────────────────────────────────
//
// The sources panel is empty for the first thirty seconds a student ever spends
// in Firmo, so whatever sits there is the first thing anyone judges the product
// by. A dashed upload box reads as broken and a flat SVG network reads as
// clip-art, so this draws the actual object the panel is about to fill with: a
// citation neighbourhood, in real perspective, turning slowly.
//
// Written against a 2D canvas rather than a WebGL library on purpose. The whole
// scene is one centre, ~40 satellites and their edges; projecting those by hand
// is a few lines of arithmetic, it costs no dependency and no CSP exception,
// and it leaves the fog, the depth-sorting and the line weights under direct
// control instead of inside someone else's material system.
//
// Everything here follows the workspace's one colour rule: the satellites are
// graphite, because nothing has been found yet, and the single cobalt node is
// the student's own topic — the one thing on the panel they already hold.
//
// ── Why this stays abstract ─────────────────────────────────────────────────
//
// The obvious next move is to feed it the project's real sources and call it a
// live citation graph. It is the wrong move, and this note is here so it does
// not get made later by accident.
//
// A citation graph's meaning is entirely in its EDGES — which of your papers
// cite which. Firmo does not have that client side. It has titles, years,
// counts and roles, and none of those imply a link between two papers. Drawing
// edges from what is on hand would mean inventing relationships and rendering
// them in the same cobalt the workspace reserves for things that have been
// verified, which is the same class of lie as telling a student their invented
// citation was "found, but check the title".
//
// So it stays what it honestly is: a mark on an empty panel that claims
// nothing. The job people expected a graph to do — "show me my collection at a
// glance" — is done properly by the shelf in ui/Shelf.jsx, which is built from
// data Firmo actually holds: real citation counts, real roles, real years.
//
// Promote this only alongside a backend that returns genuine reference overlap
// between saved sources. Until then, edges here are decoration and are drawn
// between fictional nodes, which is fine precisely because there is no data in
// the panel yet for anyone to mistake them for.

const NODES = 42
// Tuned so the cloud fills the panel strip: at this focal length and camera
// distance the projected scale runs about 0.65–0.81, which puts the near edge
// of a 118-unit sphere at roughly 95px — just inside a 168px-tall canvas.
const RADIUS = 118         // world units
const FOCAL = 340          // perspective strength — lower is a wider lens
const CAMERA_Z = 200

/** Fibonacci sphere: an even scatter, with none of the polar clumping that
 *  random spherical coordinates produce. */
function makeNodes(count) {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out = []
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    // Pushed off the shell by a little so the cloud has volume rather than
    // reading as a wireframe ball.
    const shell = 0.62 + 0.38 * ((i * 37) % 100) / 100
    out.push({
      x: Math.cos(theta) * r * RADIUS * shell,
      y: y * RADIUS * shell * 0.78,
      z: Math.sin(theta) * r * RADIUS * shell,
      // Each node drifts on its own phase so the cloud breathes unevenly, the
      // way a real scatter does, instead of pulsing as one object.
      phase: (i * 1.7) % (Math.PI * 2),
      weight: 0.45 + ((i * 53) % 100) / 180,
      // Only some nodes link back to the centre. When all of them did, the
      // scene read as a sunburst — a shape that says "loading", not "citation
      // network". Leaving four in ten unattached lets the peripheral mesh show.
      toCentre: (i % 5) < 3,
    })
  }
  return out
}

/** Edges between near neighbours, on top of the edges to the centre.
 *
 *  Without these the scene is a sunburst, and a sunburst is not what a citation
 *  neighbourhood looks like: papers cite each other, not only the topic. One
 *  link per node to its nearest unused neighbour is enough to read as a mesh
 *  while leaving the centre clearly dominant. */
function makeLinks(nodes) {
  const links = []
  const used = new Set()
  for (let i = 0; i < nodes.length; i++) {
    let best = -1
    let bestD = Infinity
    for (let j = 0; j < nodes.length; j++) {
      if (i === j || used.has(`${j}-${i}`)) continue
      const dx = nodes[i].x - nodes[j].x
      const dy = nodes[i].y - nodes[j].y
      const dz = nodes[i].z - nodes[j].z
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestD) { bestD = d; best = j }
    }
    if (best >= 0) {
      used.add(`${i}-${best}`)
      links.push([i, best])
    }
  }
  return links
}

export default function CitationLattice({ className = '', height = 168 }) {
  const canvasRef = useRef(null)
  const pointerRef = useRef({ x: 0, y: 0 })

  // Every full-screen sheet in the workspace is a backdrop-filter surface, and
  // a backdrop blur stacked over a canvas that repaints every frame makes the
  // compositor re-blur the entire viewport at that same rate. That was enough
  // to lock the renderer solid when the process record was opened. The lattice
  // is decorative and now covered, so it stops.
  const covered = useUIStore(
    s => s.showRecord || s.showImport || s.showAuth || s.showWalkthrough
      || s.mobileSidebarOpen,
  )
  // Held in a ref so the running loop can read it without the scene being torn
  // down and rebuilt every time a sheet opens.
  const coveredRef = useRef(covered)
  coveredRef.current = covered

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const nodes = makeNodes(NODES)
    const links = makeLinks(nodes)

    // Read the themed colours off the document rather than hard-coding them, so
    // the lattice follows the light/dark switch like every other surface.
    const styles = getComputedStyle(document.documentElement)
    const graphite = styles.getPropertyValue('--unverified').trim() || '140 131 121'
    const accent = styles.getPropertyValue('--accent').trim() || '122 158 255'

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let heightPx = 0
    let dpr = 1

    function resize() {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      // Assigning width/height clears the canvas and resets its transform, and
      // it also resizes the element — so writing them unconditionally inside a
      // ResizeObserver is how you build a feedback loop. Only write on a real
      // change.
      if (w === canvas.width && h === canvas.height) return
      width = rect.width
      heightPx = rect.height
      canvas.width = w
      canvas.height = h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // The lattice is ambient: it must never be the reason a laptop fan spins.
    // It stops entirely when scrolled out of the panel or when the tab is in
    // the background, and it draws at 30fps, which is plenty for a scene that
    // takes half a minute to complete one turn.
    const FRAME_MS = 1000 / 30
    let visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    io.observe(canvas)
    const onVisibility = () => { if (!document.hidden) last = 0 }
    document.addEventListener('visibilitychange', onVisibility)

    function project(x, y, z) {
      const scale = FOCAL / (FOCAL + CAMERA_Z - z)
      return {
        x: width / 2 + x * scale,
        y: heightPx / 2 + y * scale,
        scale,
      }
    }

    let raf = 0
    let last = 0
    const started = performance.now()

    function frame(now) {
      raf = requestAnimationFrame(frame)
      if (!visible || document.hidden || coveredRef.current) return
      if (now - last < FRAME_MS) return
      last = now
      draw(now)
    }

    function draw(now) {
      if (!width || !heightPx) return
      // A reduced-motion viewer gets one fixed, well-composed frame — the scene
      // still reads as a citation neighbourhood, it just does not turn.
      const t = reduced ? 2.2 : (now - started) / 1000
      // Pointer parallax: the scene leans towards the cursor and settles back.
      const spinY = t * 0.22 + pointerRef.current.x * 0.5
      const tiltX = -0.18 + pointerRef.current.y * 0.35

      const cosY = Math.cos(spinY)
      const sinY = Math.sin(spinY)
      const cosX = Math.cos(tiltX)
      const sinX = Math.sin(tiltX)

      // Index order is preserved here because the link list refers to it; the
      // painter's-algorithm sort happens on a copy further down.
      const byIndex = nodes.map(n => {
        const breathe = reduced ? 1 : 1 + Math.sin(t * 0.9 + n.phase) * 0.045
        const x0 = n.x * breathe
        const y0 = n.y * breathe
        const z0 = n.z * breathe
        // Y spin, then X tilt.
        const x1 = x0 * cosY + z0 * sinY
        const z1 = -x0 * sinY + z0 * cosY
        const y1 = y0 * cosX - z1 * sinX
        const z2 = y0 * sinX + z1 * cosX
        return { ...n, p: project(x1, y1, z2), z: z2 }
      })

      const centre = project(0, 0, 0)

      // Clear the whole bitmap in device pixels, not the logical box. Clearing
      // `width × heightPx` leaves a ghost behind whenever those variables are
      // stale relative to the canvas — which happens on the very first paint,
      // before layout has given the element its real width.
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()

      // Painter's algorithm: far nodes first, so near ones genuinely occlude.
      const placed = [...byIndex].sort((a, b) => a.z - b.z)

      // Peripheral edges, drawn first and faintest: they are the mesh the
      // centre sits inside, never competing with it.
      for (const [a, b] of links) {
        const na = byIndex[a]
        const nb = byIndex[b]
        const depth = ((na.z + nb.z) / 2 + RADIUS) / (RADIUS * 2)
        ctx.strokeStyle = `rgb(${graphite} / ${(0.03 + depth * 0.10).toFixed(3)})`
        ctx.lineWidth = 0.4 + depth * 0.4
        ctx.beginPath()
        ctx.moveTo(na.p.x, na.p.y)
        ctx.lineTo(nb.p.x, nb.p.y)
        ctx.stroke()
      }

      // Edges to the centre. Depth drives both alpha and width, which is what
      // sells the perspective — a flat network draws every line the same.
      for (const n of placed) {
        if (!n.toCentre) continue
        const depth = (n.z + RADIUS) / (RADIUS * 2)   // 0 far … 1 near
        const alpha = 0.06 + depth * 0.22
        ctx.strokeStyle = `rgb(${graphite} / ${alpha.toFixed(3)})`
        ctx.lineWidth = 0.4 + depth * 0.7
        ctx.beginPath()
        ctx.moveTo(centre.x, centre.y)
        ctx.lineTo(n.p.x, n.p.y)
        ctx.stroke()
      }

      // Satellites.
      for (const n of placed) {
        const depth = (n.z + RADIUS) / (RADIUS * 2)
        const r = (0.9 + depth * 2.0) * n.weight
        ctx.fillStyle = `rgb(${graphite} / ${(0.18 + depth * 0.55).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(n.p.x, n.p.y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // The topic. A soft halo, then the solid core, so it reads as lit rather
      // than merely coloured.
      const halo = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, 26)
      halo.addColorStop(0, `rgb(${accent} / 0.30)`)
      halo.addColorStop(1, `rgb(${accent} / 0)`)
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(centre.x, centre.y, 26, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = `rgb(${accent})`
      ctx.beginPath()
      ctx.arc(centre.x, centre.y, 3.4, 0, Math.PI * 2)
      ctx.fill()
    }

    // Paint one frame now rather than waiting on the scheduler. A canvas that
    // is blank until the first rAF flashes an empty hole in the panel on load,
    // and in a background tab — where rAF may not run for minutes — it simply
    // never appears at all.
    draw(performance.now())
    if (!reduced) raf = requestAnimationFrame(frame)

    function onPointer(e) {
      const rect = canvas.getBoundingClientRect()
      pointerRef.current = {
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
      }
    }
    // Listening on the panel rather than the canvas: a 168px strip is too small
    // a target for the parallax to feel like it is tracking you.
    const host = canvas.parentElement || canvas
    host.addEventListener('pointermove', onPointer)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('pointermove', onPointer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`w-full block ${className}`}
      style={{ height }}
    />
  )
}
