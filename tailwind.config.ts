/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Recovery v2 tokens (styles/pivota-tokens.css), namespaced `rv-` so no
      // existing class starts matching. Only --accent is themeable.
      colors: {
        'rv-accent': 'var(--accent)',
        'rv-accent-hover': 'var(--accent-hover)',
        'rv-accent-selected': 'var(--accent-selected)',
        'rv-ink': 'var(--ink)',
        'rv-muted': 'var(--muted)',
        'rv-line': 'var(--line)',
        'rv-divider': 'var(--divider)',
        'rv-surface': 'var(--surface)',
        'rv-surface-muted': 'var(--surface-muted)',
        'rv-sidebar': 'var(--sidebar)',
        'rv-success': 'var(--success)',
        'rv-success-soft': 'var(--success-soft)',
        'rv-warning': 'var(--warning)',
        'rv-warning-soft': 'var(--warning-soft)',
        'rv-error': 'var(--error)',
        'rv-error-soft': 'var(--error-soft)',
      },
      borderRadius: {
        'rv-control': 'var(--radius-control)',
        'rv-card': 'var(--radius-card)',
        'rv-badge': 'var(--radius-badge)',
      },
      fontFamily: {
        'rv-sans': 'var(--font-sans)',
        'rv-mono': 'var(--font-mono)',
      },
    },
  },
  plugins: [],
}
