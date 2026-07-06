/** @type {import('tailwindcss').Config} */
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
        // banker's-lamp pine green
        brand: {
          50:  '#f2f8f5',
          100: '#e0efe8',
          200: '#c3dfd2',
          300: '#96c6b1',
          400: '#5fa88c',
          500: '#3c8c6e',
          600: '#2a7057',
          700: '#235a47',
          800: '#1e483a',
          900: '#193b30',
          950: '#0c211b',
        },
        // warm paper neutrals (light mode surfaces)
        paper: {
          50:  '#faf9f6',
          100: '#f3f1ea',
          200: '#e7e3d8',
        },
        // deep ink (dark mode surfaces)
        ink: {
          800: '#1a201d',
          900: '#141917',
          950: '#0e1210',
        },
        highlight: '#f5c84c',
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
      },
      animation: {
        fadeInUp: 'fadeInUp 0.4s ease both',
        shimmer:  'shimmer 1.4s infinite linear',
        pulseDot: 'pulseDot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
