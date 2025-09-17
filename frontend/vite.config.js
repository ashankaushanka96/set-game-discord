import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['set-game-test.ashankaushanka.com'],
    cors: {
      origin: ['http://localhost:5173', 'https://set-game-test.ashankaushanka.com', 'https://set-game-discord.ashankaushanka.com'],
      credentials: true
    },
    headers: {
      // DEV-ONLY CSP: allow Vite's inline preamble + HMR
      "Content-Security-Policy":
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:; " +
        "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' blob: data:; " +
        "connect-src 'self' ws: wss: http: https:; " +
        "img-src 'self' data: blob: https:; " +
        "style-src 'self' 'unsafe-inline' blob:; " +
        "base-uri 'self'; frame-ancestors 'self';"
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { router: ['react-router-dom'] }
      }
    }
  },
  define: { __DEV__: JSON.stringify(process.env.NODE_ENV === 'development') }
})
