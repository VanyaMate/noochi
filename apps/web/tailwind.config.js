/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        cream: '#fcf7f2',
        parchment: '#fffaf4',
        latte: '#f2e3d6',
        cocoa: '#3b322c',
        cocoaSoft: '#75655a',
        terra: '#e0805a',
        terraDeep: '#c4633b',
        ember: '#b3402c',
        sage: '#c7d2c1',
        sageDeep: '#7b9570',
        honey: '#f7c68c',
        dusk: '#332c27',
      },
      fontFamily: {
        round: ['"Nunito"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 28px rgba(94, 62, 40, 0.10)',
        lift: '0 12px 36px rgba(94, 62, 40, 0.15)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pop: { '0%': { opacity: '0', transform: 'scale(.92)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        blink: { '0%,80%,100%': { opacity: '.2' }, '40%': { opacity: '1' } },
        glow: { '0%,100%': { opacity: '.6' }, '50%': { opacity: '1' } },
      },
      animation: {
        rise: 'rise .35s ease both',
        pop: 'pop .18s ease both',
        blink: 'blink 1.2s infinite',
        glow: 'glow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
