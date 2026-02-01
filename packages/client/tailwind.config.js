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
          'border-focus': 'var(--pi-border-focus)',
          text: 'var(--pi-text)',
          muted: 'var(--pi-muted)',
          accent: 'var(--pi-accent)',
          'accent-hover': 'var(--pi-accent-hover)',
          success: 'var(--pi-success)',
          error: 'var(--pi-error)',
          warning: 'var(--pi-warning)',
          idle: 'var(--pi-idle)',
          user: 'var(--pi-user)',
        },
      },
      fontFamily: {
        // System monospace stack
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Two sizes only: 13px content, 11px secondary
        content: '13px',
        secondary: '11px',
      },
      spacing: {
        // 8px grid
        grid: '8px',
        pane: '12px',
      },
      borderRadius: {
        // Max 4px per design guidelines
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '4px',
      },
    },
  },
  plugins: [],
};
