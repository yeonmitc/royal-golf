import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // Use VITE_BASE_PATH from GitHub Actions if available, otherwise default to '/royal-golf/'
  base: mode === 'production' ? (process.env.VITE_BASE_PATH || '/royal-golf/') : '/',
  plugins: [react()],
}))
