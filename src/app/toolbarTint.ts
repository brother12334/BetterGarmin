import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTheme } from './theme'

/**
 * Safari tints its address bar and toolbars from the page's theme-color. Keeping it the page's own background colour
 * makes the toolbars blend into the app instead of showing as a grey strip.
 */
function setThemeColor(color: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = color
}

export function useToolbarTint() {
  const { theme } = useTheme()
  const { pathname } = useLocation()

  useEffect(() => {
    const apply = () => setThemeColor(getComputedStyle(document.body).backgroundColor || '#f4f1ec')
    // Wait a frame so theme changes have restyled the body before reading its colour.
    const id = requestAnimationFrame(apply)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => {
      cancelAnimationFrame(id)
      mq.removeEventListener('change', apply)
    }
  }, [theme, pathname])
}
