const path = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{js,jsx}'),
  ],
  theme: {
    extend: {
      colors: {
        brand: '#8B1F2F',
        brandhover: '#B5394D',
        sage: '#5C9E2E',
        sagehover: '#6DC133',
        peach: '#E8B4A0',
        peachdark: '#C9876E',
        bg: '#f4f6f9',
        ink: '#1a1a2e',
        ok: '#22c55e',
        warn: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
