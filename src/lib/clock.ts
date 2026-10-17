import { useSyncExternalStore } from 'react'

/** 12-hour (3:05 PM) or 24-hour (15:05) clock, saved per browser. */
export type ClockFormat = '12h' | '24h'

const STORAGE_KEY = 'bettergarmin:clock'

function load(): ClockFormat {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === '12h' || v === '24h') return v
  } catch {
    // fall through to the device default
  }
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === false ? '24h' : '12h'
  } catch {
    return '12h'
  }
}

let format = load()
const listeners = new Set<() => void>()

export function getClockFormat(): ClockFormat {
  return format
}

export function setClockFormat(next: ClockFormat) {
  format = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // per-browser convenience; fine to lose
  }
  listeners.forEach((l) => l())
}

/** Re-renders the caller when the clock format changes. */
export function useClockFormat(): ClockFormat {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => format,
  )
}

/** A time of day, e.g. "7:20 AM" or "07:20". */
export function formatTime(t: number | Date, opts: { seconds?: boolean } = {}): string {
  const h12 = format === '12h'
  return new Date(t).toLocaleTimeString(undefined, {
    hour: h12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(opts.seconds ? { second: '2-digit' } : {}),
    hour12: h12,
  })
}

/** Just the hour, for axis ticks: "3 PM" or "15". */
export function formatHour(t: number | Date): string {
  const h12 = format === '12h'
  return new Date(t).toLocaleTimeString(undefined, { hour: h12 ? 'numeric' : '2-digit', hour12: h12 })
}

/** A fractional hour (may run past 24 for after-midnight times) as a clock time. */
export function formatClockHours(h: number): string {
  const n = ((h % 24) + 24) % 24
  let hh = Math.floor(n)
  let mm = Math.round((n - hh) * 60)
  if (mm === 60) {
    hh = (hh + 1) % 24
    mm = 0
  }
  const m = String(mm).padStart(2, '0')
  if (format === '24h') return `${String(hh).padStart(2, '0')}:${m}`
  return `${hh % 12 === 0 ? 12 : hh % 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`
}
