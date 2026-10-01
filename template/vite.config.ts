import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { ouroboros } from './.ouroboros/plugin.ts'

export default defineConfig({
  base: process.env.OUROBOROS_BASE ?? '/',
  plugins: [react(), tailwindcss(), ouroboros()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    host: true,
    allowedHosts: true,
    watch: process.env.OUROBOROS_POLL ? { usePolling: true, interval: 300, ignored: ['**/node_modules/**'] } : undefined,
  },
})
