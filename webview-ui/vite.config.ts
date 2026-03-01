import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
  },
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3847',
        ws: true,
      },
    },
  },
})
