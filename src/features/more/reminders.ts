import { useEffect } from 'react'

/**
 * Optional workout reminders with quiet hours. A web page can only remind you while it's open (a browser tab or the
 * Home Screen app in the foreground or recently backgrounded): iPhone doesn't let web pages schedule notifications for
 * later. So these are gentle nudges, never something to rely on overnight.
 */

export interface ReminderSettings {
  enabled: boolean
  /** "HH:MM", local time. */
  time: string
  /** 0 = Sunday … 6 = Saturday. */
  days: number[]
  quietStart: string
  quietEnd: string
}

const KEY = 'bettergarmin:reminders'
const FIRED_KEY = 'bettergarmin:reminderFired'
export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, time: '18:00', days: [1, 2, 3, 4, 5], quietStart: '22:00', quietEnd: '07:00' }

export function loadReminders(): ReminderSettings {
  try {
    return { ...DEFAULT_REMINDERS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_REMINDERS
  }
}

export function saveReminders(s: ReminderSettings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Quiet hours may wrap past midnight (22:00–07:00). */
export function inQuietHours(at: Date, s: Pick<ReminderSettings, 'quietStart' | 'quietEnd'>): boolean {
  const now = at.getHours() * 60 + at.getMinutes()
  const a = minutes(s.quietStart)
  const b = minutes(s.quietEnd)
  if (a === b) return false
  return a < b ? now >= a && now < b : now >= a || now < b
}

/** Whether a reminder is due at `at` and hasn't fired today. */
export function reminderDue(at: Date, s: ReminderSettings, firedDay: string | null): boolean {
  if (!s.enabled || !s.days.includes(at.getDay())) return false
  const day = at.toDateString()
  if (firedDay === day) return false
  const now = at.getHours() * 60 + at.getMinutes()
  const target = minutes(s.time)
  // Fire at the time or within the next hour (the page may have been closed at the exact minute).
  return now >= target && now < target + 60 && !inQuietHours(at, s)
}

/** Mounted once by the app shell: checks every half minute while the page is open. */
export function useReminderScheduler() {
  useEffect(() => {
    const tick = () => {
      const s = loadReminders()
      const now = new Date()
      let fired: string | null = null
      try {
        fired = localStorage.getItem(FIRED_KEY)
      } catch {
        // ignore
      }
      if (!reminderDue(now, s, fired)) return
      try {
        localStorage.setItem(FIRED_KEY, now.toDateString())
      } catch {
        // ignore
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('BetterGarmin', { body: 'Time to train. Open a routine when you are ready.', tag: 'bettergarmin-reminder' })
      }
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
}
