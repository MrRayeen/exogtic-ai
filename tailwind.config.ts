import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-figtree)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        fadeInEnhanced: 'fadeInEnhanced 0.5s ease-out forwards', // Updated name
        pulse: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        gradientAnimation: 'gradientAnimation 30s ease infinite', // Adjusted speed
      },
      keyframes: {
        fadeInEnhanced: { // Updated keyframes
          '0%': { opacity: '0', transform: 'translateY(20px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        gradientAnimation: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
};

export default config;