// Two rules that each cost a real bug before they existed.
//
// Neither is a style preference. Both describe a mistake that is invisible in
// review, silent at runtime, and shows up to the student as the product being
// broken in a way that suggests their work is gone.
//
// A script rather than an ESLint rule because the project has no linter, and a
// dependency plus a config to catch two patterns is the worse trade. Run by
// `npm run build`, not left as an optional `npm run check`: a guard you have to
// remember is the guard that was missing when this was needed.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.js') || name.endsWith('.jsx')) out.push(p)
  }
  return out
}

const rel = f => 'src/' + relative(ROOT, f).split(sep).join('/')
const lineOf = (text, i) => text.slice(0, i).split('\n').length

// ── Rule 1: no store selector may build a value ────────────────────────────
//
// Zustand compares selector results by identity. One that constructs its result
// hands back a new reference every render, so the store never sees it unchanged
// and the component re-renders until React gives up with "Maximum update depth
// exceeded". That is a white page: no message, no stack anyone sees.
//
// It happened twice - deleting the last paper, and opening Sources with nothing
// in it - from a single expression each time.

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

// From the arrow to the paren closing the store call. Counted, not matched with
// a regex, since a selector can nest parens and span lines.
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

function checkSelectors(files) {
  const found = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const re = /use\w*Store\(\s*\w+\s*=>/g
    let m
    while ((m = re.exec(text))) {
      const body = selectorBody(text, m.index + m[0].length)
      for (const [needle, label] of BUILDERS) {
        if (!body.includes(needle)) continue
        found.push({
          where: `${rel(file)}:${lineOf(text, m.index)}`,
          what: `returns ${label} -> a new reference every render`,
          then: 'the store never sees it unchanged -> render loop -> white page',
          code: body.trim().replace(/\s+/g, ' ').slice(0, 72),
          fix: 'Put it in src/stores/selectors.js behind a hook that returns a stable\n    reference (a module-level constant, or useMemo), and call that.',
        })
        break
      }
    }
  }
  return found
}

// ── Rule 2: nothing a student can trigger may call fetch directly ──────────
//
// safeFetch turns an unreachable backend into "Firmo could not be reached."
// A bare fetch lets the browser's own error reach the screen instead: Chrome
// says "Failed to fetch", Safari says "Load failed". Both are true and useless,
// and both travelled all the way to students because postJSON, streamNDJSON and
// two upload paths each called fetch directly and went around the wrapper that
// was written for exactly this.
//
// Files that legitimately fetch in the background - sync, the record buffer -
// are exempt: they already treat a failure as normal and keep what they have,
// and there is no message for a student because there is no student waiting.

const FETCH_EXEMPT = new Set([
  'src/lib/api.js',        // defines safeFetch
  'src/lib/sync.js',       // offline is a normal state; returns null, keeps local
  'src/lib/record.js',     // failed flush stays buffered and retries
  'src/lib/narrate.js',    // a local asset; falls back to speech synthesis
])

function checkFetches(files) {
  const found = []
  for (const file of files) {
    const name = rel(file)
    if (FETCH_EXEMPT.has(name)) continue
    const text = readFileSync(file, 'utf8')
    const re = /(?<!safe)\bfetch\(/g
    let m
    while ((m = re.exec(text))) {
      // `window.fetch` in a comment or a string is not a call site worth failing on.
      const line = text.slice(text.lastIndexOf('\n', m.index) + 1,
                             text.indexOf('\n', m.index))
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue
      found.push({
        where: `${name}:${lineOf(text, m.index)}`,
        what: 'calls fetch directly',
        then: "an unreachable backend reads as \"Failed to fetch\", not as a sentence",
        code: line.trim().slice(0, 72),
        fix: "Use safeFetch from src/lib/api.js, or add this file to FETCH_EXEMPT in\n    this script if it fails silently on purpose.",
      })
    }
  }
  return found
}

// ── Report ─────────────────────────────────────────────────────────────────

const files = walk(ROOT)
const problems = [...checkSelectors(files), ...checkFetches(files)]

if (problems.length) {
  console.error('')
  for (const p of problems) {
    console.error(`  ${p.where}`)
    console.error(`    ${p.what}`)
    console.error(`    -> ${p.then}`)
    console.error(`    ${p.code}`)
    console.error(`    ${p.fix}\n`)
  }
  console.error(`${problems.length} problem(s).\n`)
  process.exit(1)
}

console.log(`frontend checks ok - ${files.length} files`)
