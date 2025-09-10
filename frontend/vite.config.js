import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/set-game/', // GitHub Pages base path
  server: {
    host: '0.0.0.0', // Allow access from any IP on the local network
    port: 5173,
  },
})
