/** @type {import('tailwindcss').Config} */

// Semantic surfaces resolve through CSS variables (see index.css) so one set of
// markup renders both the charcoal workspace and the paper-light variant.
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
        app: themed('app'),        // window background
        panel: themed('panel'),    // sidebar / omni-bar body
        raised: themed('raised'),  // cards sitting on a panel
        sheet: themed('sheet'),    // the document page itself
        line: themed('line'),      // hairline borders
        edge: themed('edge'),      // stronger dividers
        t1: themed('t1'),          // primary text
        t2: themed('t2'),          // secondary text
        t3: themed('t3'),          // faint / metadata text

        // banker's-lamp pine green
        brand: {
          50:  '#f0f7f3',
          100: '#dcede4',
          200: '#b7dcc8',
          300: '#95d5b2',
          400: '#74c69d',  // vibrant badge text
          500: '#52b788',  // vibrant accent
          600: '#40916c',
          700: '#2d6a4f',  // primary green
          800: '#245741',
          900: '#1b4332',  // subtle dark green
          950: '#0d2818',
        },
        // positive / "verified" signal, brighter than pine so it reads on charcoal
        signal: '#4ade80',
        // annotation rules, matched to the washes painted in index.css
        annot: {
          amber: '#fbbf24',
          green: '#4ade80',
          red:   '#f87171',
        },

        // warm paper neutrals (light theme surfaces)
        paper: {
          50:  '#faf9f6',
          100: '#f3f1ea',
          200: '#e7e3d8',
        },
        // deep charcoal (dark theme surfaces)
        ink: {
          700: '#26333f',
          800: '#1c2833',
          850: '#16202a',
          900: '#121a21',
          950: '#0b0f12',
        },
        highlight: '#f5c84c',
      },
      letterSpacing: {
        tightest: '-0.03em',
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
        markIn: {
          '0%':   { backgroundSize: '0% 100%' },
          '100%': { backgroundSize: '100% 100%' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.4s ease both',
        shimmer:  'shimmer 1.4s infinite linear',
        pulseDot: 'pulseDot 1.2s ease-in-out infinite',
        edgeSweep: 'edgeSweep 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
