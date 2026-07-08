/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan:   '#00d4ff',
          purple: '#a855f7',
          green:  '#00ff88',
          pink:   '#ff2d8b',
          yellow: '#ffee00',
        },
        dark: {
          900: '#020212',
          800: '#06061a',
          700: '#0a0a24',
          600: '#0e0e2e',
          500: '#141438',
          400: '#1e1e4a',
          300: '#2a2a5c',
        },
      },
      boxShadow: {
        'neon-cyan':   '0 0 20px rgba(0,212,255,0.4), 0 0 60px rgba(0,212,255,0.1)',
        'neon-purple': '0 0 20px rgba(168,85,247,0.4), 0 0 60px rgba(168,85,247,0.1)',
        'neon-green':  '0 0 20px rgba(0,255,136,0.4), 0 0 60px rgba(0,255,136,0.1)',
        'neon-pink':   '0 0 20px rgba(255,45,139,0.4), 0 0 60px rgba(255,45,139,0.1)',
        'glow-sm':     '0 0 10px rgba(0,212,255,0.3)',
        'glow-md':     '0 0 25px rgba(0,212,255,0.35)',
        'glow-lg':     '0 0 50px rgba(0,212,255,0.25)',
        'card':        '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'gradient-neon': 'linear-gradient(135deg, #020212 0%, #06061a 50%, #0a0a24 100%)',
        'gradient-cyan-purple': 'linear-gradient(135deg, #00d4ff, #a855f7)',
        'gradient-green-cyan':  'linear-gradient(135deg, #00ff88, #00d4ff)',
        'gradient-pink-purple': 'linear-gradient(135deg, #ff2d8b, #a855f7)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float':      'float 3s ease-in-out infinite',
        'scan':       'scan 4s linear infinite',
        'blink':      'blink 1s step-end infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        scan: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
