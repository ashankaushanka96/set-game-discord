export default {
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    theme: { 
      extend: {
        colors: {
          // Coordinated color palette
          'dark-primary': '#0f1419',
          'dark-secondary': '#1a2332',
          'dark-tertiary': '#243447',
          'dark-accent': '#2d3f5c',
          'dark-card': '#1e2a3a',
          'dark-table': '#0f1419',
          'dark-table-center': '#1a2332',
          
          // Text colors
          'text-primary': '#e2e8f0',
          'text-secondary': '#cbd5e1',
          'text-muted': '#94a3b8',
          
          // Accent colors
          'accent-blue': '#3b82f6',
          'accent-purple': '#8b5cf6',
          'accent-pink': '#ec4899',
          'accent-emerald': '#059669',
          'accent-amber': '#d97706',
          'accent-rose': '#dc2626',
          'accent-cyan': '#0891b2',
          'accent-indigo': '#6366f1',
        },
        backgroundImage: {
          'gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          'gradient-secondary': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          'gradient-accent': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          'gradient-warm': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          'gradient-cool': 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
          'gradient-dark': 'linear-gradient(135deg, #0f1419 0%, #1a2332 50%, #243447 100%)',
          'gradient-vibrant': 'linear-gradient(135deg, #0f1419 0%, #1a2332 50%, #243447 100%)',
        },
        spacing: {
          '25': '6.25rem',
          '30': '7.5rem',
        },
        boxShadow: {
          'glow-blue': '0 0 20px rgba(59, 130, 246, 0.3)',
          'glow-purple': '0 0 20px rgba(139, 92, 246, 0.3)',
          'glow-pink': '0 0 20px rgba(236, 72, 153, 0.3)',
          'glow-emerald': '0 0 20px rgba(16, 185, 129, 0.3)',
          'glow-amber': '0 0 20px rgba(245, 158, 11, 0.3)',
          'glow-rose': '0 0 20px rgba(244, 63, 94, 0.3)',
          'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.3)',
        }
      }
    },
    plugins: [],
  };
  