import { useSyncExternalStore } from 'react'

/**
 * The Today screen's layout: which widgets show and in what order. The look itself is fixed (colour blocks); this is
 * the one thing the owner can arrange. Saved per browser.
 */

/** Every widget on the Today screen that can be moved or hidden. */
export const TODAY_WIDGETS = [
  // Default order follows the morning glance: how am I (readiness, sleep/stress/energy), then how the day may go.
  { id: 'hero', label: 'Greeting & readiness' },
  { id: 'sync', label: 'Sync status messages' },
  { id: 'bars', label: 'Sleep, stress, energy & steps' },
  { id: 'forecast', label: 'Energy forecast' },
  { id: 'training', label: 'Training (latest workout)' },
  { id: 'energy', label: 'Energy Reserve curve' },
  { id: 'stats', label: 'Floors, calories, distance' },
  { id: 'lastNight', label: 'How you slept (sleep stages)' },
  { id: 'heartRate', label: 'Heart rate' },
  { id: 'insights', label: "Today's insights" },
] as const

export type WidgetId = (typeof TODAY_WIDGETS)[number]['id']
export interface WidgetSlot {
  id: WidgetId
  visible: boolean
}

export interface Appearance {
  todayLayout: WidgetSlot[]
}

// The key and shape predate the fixed look; only todayLayout is read from it now.
const STORAGE_KEY = 'bettergarmin:appearance'

/** Keeps saved layouts valid as widgets are added or removed in later versions. */
function normalizeLayout(layout: WidgetSlot[] | undefined): WidgetSlot[] {
  const known = new Set<string>(TODAY_WIDGETS.map((w) => w.id))
  const kept = (layout ?? []).filter((s) => known.has(s.id))
  const seen = new Set(kept.map((s) => s.id))
  // New widgets slot in after the widget that precedes them in the default order, not at the very end.
  const out = [...kept]
  TODAY_WIDGETS.forEach((w, i) => {
    if (seen.has(w.id)) return
    const prev = i > 0 ? out.findIndex((s) => s.id === TODAY_WIDGETS[i - 1].id) : -1
    out.splice(prev + 1, 0, { id: w.id, visible: true })
    seen.add(w.id)
  })
  return out
}

function load(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { todayLayout: normalizeLayout((JSON.parse(raw) as Partial<Appearance>).todayLayout) }
  } catch {
    // fall through to the default layout
  }
  return { todayLayout: normalizeLayout(undefined) }
}

let state = load()
const listeners = new Set<() => void>()

export function updateAppearance(patch: Partial<Appearance>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // per-browser convenience; fine to lose
  }
  listeners.forEach((l) => l())
}

export function resetAppearance() {
  updateAppearance({ todayLayout: normalizeLayout(undefined) })
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
