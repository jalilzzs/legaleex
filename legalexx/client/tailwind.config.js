/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 50: '#f3f6fb', 100: '#e3eaf5', 200: '#c3d1e8', 400: '#5b7bb0', 600: '#1f3a66', 700: '#152c50', 800: '#0f2142', 900: '#0b1f3a', 950: '#06142a' },
        gold: { 50: '#fbf6e9', 100: '#f4e8c5', 300: '#dcbd6e', 400: '#cda24a', 500: '#b8892f', 600: '#9a6f22' },
      },
      fontFamily: {
        sans: ['Inter', 'Cairo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        arabic: ['Cairo', 'Inter', 'sans-serif'],
      },
      boxShadow: { soft: '0 10px 40px -12px rgba(11,31,58,.25)' },
    },
  },
  plugins: [],
};
