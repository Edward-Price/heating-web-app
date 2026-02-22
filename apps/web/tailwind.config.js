/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#f6f9fc',
        foreground: '#0a2540',
        card: '#ffffff',
        border: '#e6ebf1',
        accent: '#635bff',
        muted: '#425466'
      }
    }
  },
  plugins: []
};
