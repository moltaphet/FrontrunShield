/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#05070b', 900: '#0a0e15', 850: '#0e131c', 800: '#131a25', 700: '#1c2533', 600: '#2a3648', 500: '#3b4a60' },
        shield: { 400: '#34e0a1', 500: '#10c98a', 600: '#0da673' },
        toxic: { 400: '#ff6b6b', 500: '#f0454a', 600: '#c92f35' },
        amberx: { 400: '#ffc857', 500: '#f5a623' },
        cyanx: { 400: '#5ad2ff', 500: '#22b8f0' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        flow: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '24px 0' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(52,224,161,.55)' }, '100%': { boxShadow: '0 0 0 10px rgba(52,224,161,0)' } },
        fadeUp: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'none' } },
      },
      animation: {
        flow: 'flow 0.8s linear infinite',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        fadeUp: 'fadeUp .35s ease both',
      },
    },
  },
  plugins: [],
}
