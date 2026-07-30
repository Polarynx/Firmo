/** @type {import('tailwindcss').Config} */

// Semantic surfaces resolve through CSS variables (see index.css) so one set of
// markup renders both the obsidian workspace and the paper-light variant.
const themed = name => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        // Dense metadata rows: same voice, narrower set width.
        narrow: ['Archivo Narrow', 'Archivo', 'system-ui', 'sans-serif'],
        display: ['Newsreader', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // ── Semantic workspace surfaces ──
        app: themed('app'),        // base canvas
        panel: themed('panel'),    // side panels
        raised: themed('raised'),  // floating cards, hover states
        sheet: themed('sheet'),    // the document page itself
        line: themed('line'),      // hairline borders
        edge: themed('edge'),      // stronger dividers
        t1: themed('t1'),          // primary text
        t2: themed('t2'),          // secondary text
        t3: themed('t3'),          // faint / metadata text

        // Translucent stroke colour. White on obsidian, ink on paper, so
        // `border-hair/10` is a real 1px translucent border in both themes
        // rather than a solid grey line that has to be tuned twice.
        hair: 'rgb(var(--hair) / <alpha-value>)',

        // ── Cobalt ink: the *verified* colour ──
        // Colour in this workspace is earned, not decorative. A source, a
        // claim, or a citation renders in graphite until something backs it,
        // and turns cobalt once it does. The ground is warm and the signal is
        // cold, so a backed thing separates from the page by temperature as
        // well as by hue — and green stays free for the claim layer, which
        // already means "good" in the draft.
        brand: {
          50:  '#eef2ff',
          100: '#dde4ff',
          200: '#bcc9ff',
          300: '#93a9ff',
          400: '#7a9eff',  // dark-theme accent
          500: '#4d7cfe',  // primary signal
          600: '#3560e8',
          700: '#2946c8',  // light-theme accent
          800: '#1f35a0',
          900: '#1b2c7a',
          950: '#121b4d',
        },
        // brighter than brand-500 so "verified" still reads at 10px on #100E0C
        signal: '#7a9eff',
        // The unverified state. Deliberately hueless against the warm ground:
        // anything the student has not backed yet reads as unfinished pencil.
        // Themed, so it is graphite on paper and ash on ink.
        unverified: 'rgb(var(--unverified) / <alpha-value>)',
        // annotation rules, matched to the washes painted in index.css
        annot: {
          amber: '#fbbf24',
          green: '#4ade80',
          red:   '#f87171',
        },

        // warm paper neutrals (light theme surfaces)
        paper: {
          50:  '#f7f5f0',
          100: '#f0ede6',
          200: '#e0dbd1',
        },
        // layered warm ink (dark theme surfaces) — a reading room at night,
        // not a terminal.
        ink: {
          base:   '#100e0c',
          panel:  '#191512',
          raised: '#221c18',
          lift:   '#2b241f',
        },
        highlight: '#f5c84c',
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      // ── Radius carries meaning ──
      // A record is square, because a catalogue card, a DOI and a works-cited
      // entry are printed things. A control is rounded, because it is a thing
      // you press. When every surface shared one radius nothing read as a
      // record, and the workspace was all chrome.
      borderRadius: {
        record: '2px',
        control: '8px',
      },
      boxShadow: {
        // The command dock genuinely floats; it needs more than a panel shadow.
        dock: '0 1px 0 0 rgb(255 255 255 / 0.06) inset, 0 24px 60px -18px rgb(0 0 0 / 0.75)',
        keycap: '0 1px 0 0 rgb(255 255 255 / 0.06) inset, 0 1px 2px 0 rgb(0 0 0 / 0.4)',
        card: '0 12px 32px -16px rgb(0 0 0 / 0.5)',
      },
      keyframes: {
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-700px 0' },
          '100%': { backgroundPosition: '700px 0' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '0.35' },
          '50%':      { opacity: '1' },
        },
        // Loading: a light travels the edge of the zone instead of a spinner.
        edgeSweep: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        // Confidence bars fill from empty rather than appearing filled.
        barGrow: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        // Citation-graph nodes in the empty state. Opacity only: `r` is an SVG
        // presentation attribute with uneven CSS-animation support, and a
        // transform on a <circle> would need its own transform-box.
        nodePulse: {
          '0%, 100%': { opacity: '0.25' },
          '50%':      { opacity: '0.9' },
        },
        edgeDraw: {
          '0%':   { strokeDashoffset: '120', opacity: '0' },
          '35%':  { opacity: '0.7' },
          '100%': { strokeDashoffset: '0', opacity: '0.18' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.4s ease both',
        shimmer:  'shimmer 1.4s infinite linear',
        pulseDot: 'pulseDot 1.2s ease-in-out infinite',
        edgeSweep: 'edgeSweep 1.5s ease-in-out infinite',
        barGrow: 'barGrow 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
