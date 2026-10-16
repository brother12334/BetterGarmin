import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'
  }
}

// Deployed to GitHub Pages at https://<user>.github.io/<repo>/. Paths are case-sensitive, so the base is
// taken from the repo name in CI (forks under another name just work); BASE_PATH overrides it.
const REPO_NAME = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'BetterGarmin'
const REPO_BASE = process.env.BASE_PATH ?? `/${REPO_NAME}/`

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
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
