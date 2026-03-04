/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: '#4f74f3',
        deal:  '#fb923c',
      },
      fontFamily: {
        display: ['Switzer', 'system-ui', 'sans-serif'],
        body:    ['Geist', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
