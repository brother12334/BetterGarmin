import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { copyFileSync, readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'
  }
}

// The last number counts commits, so every pushed update bumps it automatically (the deploy checks out full history).
function appVersion(): string {
  const [major, minor] = pkg.version.split('.')
  try {
    const n = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return `${major}.${minor}.${n}`
  } catch {
    return pkg.version
  }
}

// Deployed to GitHub Pages at https://<user>.github.io/<repo>/. Paths are case-sensitive, so the base is
// taken from the repo name in CI (forks under another name just work); BASE_PATH overrides it.
const REPO_NAME = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'BetterGarmin'
const REPO_BASE = process.env.BASE_PATH ?? `/${REPO_NAME}/`
const REPO_OWNER = (process.env.GITHUB_REPOSITORY?.split('/')[0] ?? 'brother12334').toLowerCase()
// Absolute site URL for social previews (og:image must be absolute). SITE_URL overrides it for custom domains.
const SITE_URL = process.env.SITE_URL ?? `https://${REPO_OWNER}.github.io${REPO_BASE}`

const siteUrlInHtml = {
  name: 'site-url',
  transformIndexHtml: (html: string) => html.replaceAll('%SITE_URL%', SITE_URL),
}

// GitHub Pages only serves real files, so reloading a screen like /insights would hit its 404 page. Serving the
// app itself as 404.html lets the router take over and show the right screen.
const spaFallback = {
  name: 'spa-404-fallback',
  closeBundle() {
    try {
      copyFileSync('dist/index.html', 'dist/404.html')
    } catch {
      // not a production build
    }
  },
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [siteUrlInHtml, 
    spaFallback,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'BetterGarmin',
        short_name: 'BetterGarmin',
        description: 'Sleep, heart rate, training load and recovery from your Garmin watch in one fast dashboard. Runs in your browser; optional cloud sync you host yourself.',
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
        // Keep the Manrope font available offline too.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  worker: {
    format: 'es',
  },
}))
