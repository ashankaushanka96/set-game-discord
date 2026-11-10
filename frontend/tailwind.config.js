export default {
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    theme: { 
      extend: {
        colors: {
          // Elegant color palette
          'dark-primary': '#101d1c',
          'dark-secondary': '#182925',
          'dark-tertiary': '#254238',
          'dark-accent': '#665634',
          'dark-card': '#1c2d29',
          'dark-table': '#101d1c',
          'dark-table-center': '#182925',
          
          // Text colors
          'text-primary': '#f3ecdd',
          'text-secondary': '#cecaba',
          'text-muted': '#9aac9f',
          
          // Accent colors
          'accent-blue': '#7faeda',
          'accent-purple': '#c3a571',
          'accent-pink': '#cc9b93',
          'accent-emerald': '#75b79b',
          'accent-amber': '#dfbd79',
          'accent-rose': '#df9191',
          'accent-cyan': '#97cbbb',
          'accent-indigo': '#a3b7b3',
        },
        backgroundImage: {
          'gradient-primary': 'linear-gradient(135deg, #31554b 0%, #214238 100%)',
          'gradient-secondary': 'linear-gradient(135deg, #744d49 0%, #533735 100%)',
          'gradient-accent': 'linear-gradient(135deg, #eee0bb 0%, #c6a466 100%)',
          'gradient-warm': 'linear-gradient(135deg, #d9bd83 0%, #a98548 100%)',
          'gradient-cool': 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
          'gradient-dark': 'linear-gradient(135deg, #101d1c 0%, #182925 50%, #254238 100%)',
          'gradient-vibrant': 'linear-gradient(135deg, #101d1c 0%, #182925 50%, #254238 100%)',
        },
        spacing: {
          '25': '6.25rem',
          '30': '7.5rem',
        },
        boxShadow: {
          'glow-blue': '0 4px 16px rgba(0, 0, 0, 0.16)',
          'glow-purple': '0 4px 16px rgba(0, 0, 0, 0.16)',
          'glow-pink': '0 4px 16px rgba(0, 0, 0, 0.16)',
          'glow-emerald': '0 4px 16px rgba(0, 0, 0, 0.16)',
          'glow-amber': '0 4px 16px rgba(0, 0, 0, 0.16)',
          'glow-rose': '0 4px 16px rgba(0, 0, 0, 0.16)',
          'glow-cyan': '0 4px 16px rgba(0, 0, 0, 0.16)',
        }
      }
    },
    plugins: [],
  };
  