/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pi color scheme using CSS variables for theming
        pi: {
          bg: 'var(--pi-bg)',
          surface: 'var(--pi-surface)',
          border: 'var(--pi-border)',
          text: 'var(--pi-text)',
          muted: 'var(--pi-muted)',
          accent: 'var(--pi-accent)',
          'accent-hover': 'var(--pi-accent-hover)',
          success: 'var(--pi-success)',
          error: 'var(--pi-error)',
          warning: 'var(--pi-warning)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
