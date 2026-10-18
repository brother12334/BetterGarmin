import { useSyncExternalStore } from 'react'

/**
 * Optional iOS Shortcut that makes Sync now hands-off: it opens Garmin Connect so the watch uploads, starts the
 * cloud sync, then comes back here. Saved per browser.
 */
export const SHORTCUT_NAME = 'BetterGarmin Sync'
const STORAGE_KEY = 'bettergarmin:shortcutSync'

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

let enabled = load()
const listeners = new Set<() => void>()

export function getShortcutSync(): boolean {
  return enabled
}

export function setShortcutSync(next: boolean) {
  enabled = next
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // per-browser convenience; fine to lose
  }
  listeners.forEach((l) => l())
}

export function useShortcutSync(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => enabled,
  )
}

const FULLSCREEN_KEY = 'bettergarmin:restoreFullscreen'

/** Runs the Shortcut. The "app" input tells it to return to BetterGarmin instead of the Home Screen. */
export function runSyncShortcut() {
  try {
    localStorage.setItem(FULLSCREEN_KEY, String(Date.now()))
  } catch {
    // fullscreen just won't be restored
  }
  window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=app`
}

type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean }
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

/**
 * Coming back from the Shortcut, the browser shows its toolbars again. Pages may only go fullscreen in response to
 * a tap, so the first tap after returning re-enters fullscreen (where the browser supports it).
 */
export function installFullscreenRestore() {
  const wanted = () => {
    try {
      const at = Number(localStorage.getItem(FULLSCREEN_KEY) ?? 0)
      return Date.now() - at < 15 * 60 * 1000
    } catch {
      return false
    }
  }
  const onTap = () => {
    if (!wanted()) return
    try {
      localStorage.removeItem(FULLSCREEN_KEY)
    } catch {
      // ignore
    }
    const doc = document as FullscreenDoc
    if (doc.fullscreenElement || doc.webkitFullscreenElement) return
    const el = document.documentElement as FullscreenEl
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.()
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {})
    } catch {
      // not supported in this browser
    }
  }
  document.addEventListener('pointerdown', onTap, { capture: true })
  return () => document.removeEventListener('pointerdown', onTap, { capture: true })
}
