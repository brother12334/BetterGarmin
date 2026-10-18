import { useSyncExternalStore } from 'react'

/** Keep the app fullscreen (browser toolbars hidden) wherever the browser allows it. On by default; saved per browser. */
const STORAGE_KEY = 'bettergarmin:fullscreen'

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

let enabled = load()
const listeners = new Set<() => void>()

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

function isFullscreen(): boolean {
  const doc = document as FullscreenDoc
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement)
}

function quiet(p: unknown) {
  if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {})
}

function enter() {
  if (isFullscreen()) return
  const el = document.documentElement as FullscreenEl
  try {
    quiet(el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.())
  } catch {
    // not supported in this browser
  }
}

function exit() {
  if (!isFullscreen()) return
  const doc = document as FullscreenDoc
  try {
    quiet(doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())
  } catch {
    // ignore
  }
}

export function setFullscreenPref(next: boolean) {
  enabled = next
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // per-browser convenience; fine to lose
  }
  // Called from the settings tap, which counts as the gesture browsers require.
  if (next) enter()
  else exit()
  listeners.forEach((l) => l())
}

export function useFullscreenPref(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => enabled,
  )
}

/**
 * Browsers only allow fullscreen in response to a tap, so any tap while the setting is on (and the page isn't
 * already fullscreen) re-enters it: after launch, after returning from another app, or after the browser drops it.
 */
export function installAutoFullscreen() {
  const onTap = () => {
    if (enabled) enter()
  }
  document.addEventListener('pointerdown', onTap, { capture: true })
  return () => document.removeEventListener('pointerdown', onTap, { capture: true })
}
