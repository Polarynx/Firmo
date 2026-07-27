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
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
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

        // Emerald: the signal colour. Pine at the dark end for the light
        // theme, mint at the bright end so it survives on obsidian.
        brand: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',  // dark-theme accent
          500: '#10b981',  // primary signal
          600: '#059669',
          700: '#047857',  // light-theme accent
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // brighter than brand-500 so "verified" still reads at 10px on #08090C
        signal: '#34d399',
        // annotation rules, matched to the washes painted in index.css
        annot: {
          amber: '#fbbf24',
          green: '#34d399',
          red:   '#f87171',
        },

        // warm paper neutrals (light theme surfaces)
        paper: {
          50:  '#faf9f6',
          100: '#f4f2ec',
          200: '#e7e3d8',
        },
        // layered obsidian (dark theme surfaces)
        obsidian: {
          base:   '#08090c',
          panel:  '#0d0e14',
          raised: '#141722',
          lift:   '#1b1f2c',
        },
        highlight: '#f5c84c',
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      boxShadow: {
        // The command dock genuinely floats; it needs more than a panel shadow.
        dock: '0 1px 0 0 rgb(255 255 255 / 0.06) inset, 0 24px 60px -18px rgb(0 0 0 / 0.75)',
        keycap: '0 1px 0 0 rgb(255 255 255 / 0.06) inset, 0 1px 2px 0 rgb(0 0 0 / 0.4)',
        glowEmerald: '0 0 25px rgb(16 185 129 / 0.15)',
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
        // Gradient sweep across clipped text. Slow: it should read as a
        // material the light moves over, not as a marquee.
        shimmerText: {
          '0%':   { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
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
        // The ambient mesh behind the canvas breathes to signal AI readiness.
        meshDrift: {
          '0%, 100%': { opacity: '0.55', transform: 'translate3d(0,0,0) scale(1)' },
          '50%':      { opacity: '0.9',  transform: 'translate3d(0,-2%,0) scale(1.06)' },
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
        shimmerText: 'shimmerText 6s linear infinite',
        pulseDot: 'pulseDot 1.2s ease-in-out infinite',
        edgeSweep: 'edgeSweep 1.5s ease-in-out infinite',
        meshDrift: 'meshDrift 11s ease-in-out infinite',
        barGrow: 'barGrow 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
