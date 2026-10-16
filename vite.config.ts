import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A relative base keeps every asset URL (including the analysis worker)
// working no matter which sub-path GitHub Pages serves the site from.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false },
})
