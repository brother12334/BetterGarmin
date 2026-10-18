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

/** Runs the Shortcut. The "app" input tells it to return to BetterGarmin instead of the Home Screen. */
export function runSyncShortcut() {
  window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=app`
}

