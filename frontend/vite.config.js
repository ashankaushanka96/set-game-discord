import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['set-game-test.ashankaushanka.com', 'set-game.ashankaushanka.dev'],
    cors: {
      origin: ['http://localhost:5173', 'https://set-game-test.ashankaushanka.com', 'https://set-game-discord.ashankaushanka.com', 'https://set-game.ashankaushanka.dev'],
      credentials: true
    },
    // Forward relative /api calls (REST + WebSocket) to the local backend,
    // so the Discord Activity only needs a single URL mapping.
    proxy: {
      '/api': { target: 'http://localhost:8001', changeOrigin: true, ws: true }
    },
    // HMR socket goes through Cloudflare/Discord on 443
    hmr: { clientPort: 443 },
    headers: {
      // DEV-ONLY CSP: allow Vite's inline preamble + HMR
      "Content-Security-Policy":
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://static.cloudflareinsights.com; " +
        "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://static.cloudflareinsights.com; " +
        "connect-src 'self' ws: wss: http: https:; " +
        "img-src 'self' data: blob: https:; " +
        "style-src 'self' 'unsafe-inline' blob:; " +
        "base-uri 'self'; frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com;"
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
