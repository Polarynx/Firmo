// Fail the build on a zustand selector that builds its result.
//
// Zustand compares what a selector returns by identity. A selector ending in
// `|| []`, `.map(...)`, `.filter(...)` or `new Set(...)` hands back a fresh
// reference every time it runs, never equal to the last one, so the component
// re-renders forever and React eventually throws "Maximum update depth
// exceeded". The user sees a white page — no message, no error, and no reason
// to think their work survived it.
//
// This has shipped twice. Once from DeviceOnlyNote, once from AddSource, and
// the second one landed on the emptiest screen in the product, which is the
// first screen a new user sees. Both times the comment in stores/selectors.js
// already said not to; a comment is not a guard.
//
// The stable versions live in stores/selectors.js: a module-level EMPTY for
// the miss case, useMemo for anything genuinely derived. Use those, or read a
// primitive the store already holds.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const ALLOW = ['stores/selectors.js']   // where the stable versions are defined

// A store hook called with an inline selector, up to the end of that line.
const SELECTOR = /use[A-Z]\w*Store\(\s*(?:s|state)\s*=>\s*([^\n]*)/g
const BUILDS = [
  [/\|\|\s*\[\]/, '`|| []` — a new array every call'],
  [/\|\|\s*\{\}/, '`|| {}` — a new object every call'],
  [/\.map\s*\(/, '.map() — a new array every call'],
  [/\.filter\s*\(/, '.filter() — a new array every call'],
  [/\.slice\s*\(/, '.slice() — a new array every call'],
  [/new\s+Set\s*\(/, 'new Set() — a new set every call'],
  [/new\s+Map\s*\(/, 'new Map() — a new map every call'],
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(p)) out.push(p)
  }
  return out
}

const problems = []
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (ALLOW.includes(rel)) continue
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  for (const m of src.matchAll(SELECTOR)) {
    // Only the selector body, not a trailing argument or comment.
    const body = m[1]
    for (const [re, why] of BUILDS) {
      if (re.test(body)) {
        const line = src.slice(0, m.index).split('\n').length
        problems.push(`  ${rel}:${line}  ${why}\n      ${lines[line - 1].trim()}`)
        break
      }
    }
  }
}

if (problems.length) {
  console.error(
    '\nUnstable zustand selector(s) — these re-render forever and white-screen the app:\n\n'
    + problems.join('\n\n')
    + '\n\nUse a hook from stores/selectors.js, or select a value the store already holds.\n'
  )
  process.exit(1)
}
console.log(`selector check: ${walk(ROOT).length} files clean`)
