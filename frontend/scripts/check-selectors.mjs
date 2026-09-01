// Selectors that build a new value on every render.
//
// Zustand compares what a selector returns by identity. A selector that
// constructs its result — `|| []`, `.map(...)`, `new Set(...)` — hands back a
// fresh reference every time it runs, so the store never sees the value as
// unchanged, and the component re-renders until React gives up with "Maximum
// update depth exceeded". That is a white page: no message, no stack anyone
// sees, and it looks exactly like lost work.
//
// It has happened twice. Once when the last paper was deleted, once when the
// Sources tab was opened with nothing in it. Both were a single expression,
// both took far longer to find than to fix, and stores/selectors.js exists to
// hold the stable versions. Nothing stopped the next person reaching past it,
// which is what this is for.
//
// A grep rather than an ESLint rule on purpose: the project has no linter, and
// one dependency plus a config to catch one pattern is a worse trade than the
// forty lines below running in the build.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', 'src')

// Whose presence in a selector body means it is building a value rather than
// reading one.
const BUILDERS = [
  ['|| []', 'a new empty array'],
  ['|| {}', 'a new empty object'],
  ['.map(', '.map()'],
  ['.filter(', '.filter()'],
  ['.slice(', '.slice()'],
  ['.sort(', '.sort()'],
  ['.concat(', '.concat()'],
  ['new Set(', 'a new Set'],
  ['new Map(', 'a new Map'],
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.js') || name.endsWith('.jsx')) out.push(p)
  }
  return out
}

// The selector body: from the arrow to the paren that closes the store call.
// Counted rather than matched with a regex, since a selector can nest parens
// and span lines.
function selectorBody(text, from) {
  let depth = 1
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return text.slice(from, i)
    }
  }
  return text.slice(from)
}

const files = walk(ROOT)
const problems = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const re = /use\w*Store\(\s*\w+\s*=>/g
  let m
  while ((m = re.exec(text))) {
    const body = selectorBody(text, m.index + m[0].length)
    for (const [needle, label] of BUILDERS) {
      if (!body.includes(needle)) continue
      problems.push({
        file: relative(ROOT, file).split(sep).join('/'),
        line: text.slice(0, m.index).split('\n').length,
        label,
        snippet: body.trim().replace(/\s+/g, ' ').slice(0, 72),
      })
      break
    }
  }
}

if (problems.length) {
  console.error('\nStore selectors that build a new value on every render:\n')
  for (const p of problems) {
    console.error(`  src/${p.file}:${p.line}`)
    console.error(`    returns ${p.label} -> a new reference every render`)
    console.error('    -> the store never sees it unchanged -> render loop -> white page')
    console.error(`    ${p.snippet}\n`)
  }
  console.error('Put the derived value in src/stores/selectors.js behind a hook that returns')
  console.error('a stable reference (a module-level constant, or useMemo), and call that.\n')
  process.exit(1)
}

console.log(`selectors ok - ${files.length} files checked`)
