import { useSyncExternalStore } from 'react'

/**
 * Where Sync now gets data from. 'cloud' (the default) refreshes the Garmin cloud copy that Garmin Connect uploads;
 * 'band' reads the band directly over Bluetooth first. Direct band sync is unreliable on iPhone once iOS has paired
 * the band (see docs/troubleshooting.md), so it's opt-in. Saved per browser.
 */
export type SyncSource = 'cloud' | 'band'

const STORAGE_KEY = 'bettergarmin:syncSource'

function load(): SyncSource {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'band' ? 'band' : 'cloud'
  } catch {
    return 'cloud'
  }
}

let source = load()
const listeners = new Set<() => void>()

export function getSyncSource(): SyncSource {
  return source
}

export function setSyncSource(next: SyncSource) {
  source = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // private mode: still applies for this visit
  }
  for (const l of listeners) l()
}

export function useSyncSource(): SyncSource {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => source,
  )
}
