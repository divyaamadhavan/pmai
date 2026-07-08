import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Skip type checking during build — types are checked separately
    sourcemap: false,
  },
  esbuild: {
    // Transpile only, no type checking
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
