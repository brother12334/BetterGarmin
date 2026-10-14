import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Project is deployed to GitHub Pages at https://<user>.github.io/BetterGarmin/
// GitHub Pages paths are case-sensitive, so this must match the repo name exactly.
const REPO_BASE = '/BetterGarmin/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'BetterGarmin',
        short_name: 'BetterGarmin',
        description: 'A sleeker, deeper dashboard for your Garmin health data — 100% local, nothing ever uploaded.',
        theme_color: '#0a0b0f',
        background_color: '#0a0b0f',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Demo DB files can be large; let them load on demand rather than precaching.
        // jpg: the Today hero's daily backdrop photos — small enough to precache for offline use.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  worker: {
    format: 'es',
  },
}))
