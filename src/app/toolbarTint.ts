import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { GRADIENTS, useAppearance, useCustomPhoto, usesFullBackdrop } from './appearance'
import { useTheme } from './theme'
import { getTodayPhoto } from '../lib/dailyBackdrop'

/**
 * Safari tints its address bar and toolbars from the page's theme-color (and the colour at the top of the page).
 * Keeping that colour in step with what's actually at the top of the screen makes the toolbars blend into the app
 * instead of showing as a grey strip.
 */

const sampled = new Map<string, string>()

/** Average colour of the top strip of an image, where the toolbar sits. */
function sampleTopColor(src: string): Promise<string> {
  const hit = sampled.get(src)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 16
        canvas.height = 4
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve('#0a0b0f')
        ctx.drawImage(img, 0, 0, img.width, Math.max(1, img.height * 0.12), 0, 0, 16, 4)
        const d = ctx.getImageData(0, 0, 16, 4).data
        let r = 0
        let g = 0
        let b = 0
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]
          g += d[i + 1]
          b += d[i + 2]
        }
        const n = d.length / 4
        const hex = toHex(r / n, g / n, b / n)
        sampled.set(src, hex)
        resolve(hex)
      } catch {
        resolve('#0a0b0f')
      }
    }
    img.onerror = () => resolve('#0a0b0f')
    img.src = src
  })
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
}

/** Applies the backdrop's dim overlay (black at `dim`%) so the tint matches what's on screen. */
function darken(hex: string, dim: number): string {
  const n = parseInt(hex.slice(1), 16)
  const k = 1 - dim / 100
  return toHex(((n >> 16) & 255) * k, ((n >> 8) & 255) * k, (n & 255) * k)
}

/** The gradient's top colour: the first stop of its base linear-gradient. */
function gradientTop(css: string): string {
  const m = css.match(/linear-gradient\([^#]*(#[0-9a-f]{6})/i) ?? css.match(/#[0-9a-f]{6}/i)
  return (m?.[1] ?? m?.[0] ?? '#0a0b0f').toLowerCase()
}

function setThemeColor(color: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = color
  // Also shows in the overscroll area above and below the page.
  document.documentElement.style.backgroundColor = color
}

export function useToolbarTint() {
  const a = useAppearance()
  const custom = useCustomPhoto()
  const { theme } = useTheme()
  const { pathname } = useLocation()

  useEffect(() => {
    let cancelled = false
    const heroOnTop = pathname === '/' && a.todayLayout.find((w) => w.visible)?.id === 'hero'
    const backdropOnTop = heroOnTop || usesFullBackdrop(a)

    const apply = async () => {
      let color: string
      if (!backdropOnTop) {
        color = getComputedStyle(document.body).backgroundColor || '#0a0b0f'
      } else if (a.backgroundMode === 'gradient') {
        color = darken(gradientTop((GRADIENTS[a.gradient] ?? GRADIENTS.aurora).css), a.dim)
      } else {
        const src =
          a.backgroundMode === 'custom' && custom ? custom : `${import.meta.env.BASE_URL}${a.backgroundMode === 'photo' ? a.photo : getTodayPhoto().src}`
        color = darken(await sampleTopColor(src), a.dim)
      }
      if (!cancelled) setThemeColor(color)
    }
    // Wait a frame so theme changes have restyled the body before reading its colour.
    const id = requestAnimationFrame(() => void apply())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => void apply()
    mq.addEventListener('change', onScheme)
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
      mq.removeEventListener('change', onScheme)
    }
  }, [a, custom, theme, pathname])
}
