/** Date/time formatting helpers matching the naive (no-timezone) strings GarminDB stores. */

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Builds a Date from a day string plus a minute-of-day offset. */
export function atMinute(day: string, minuteOfDay: number): Date {
  const d = new Date(`${day}T00:00:00`)
  d.setMinutes(d.getMinutes() + minuteOfDay)
  return d
}

export function toDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export function secondsToHms(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

export function minutesToHms(totalMinutes: number): string {
  return secondsToHms(totalMinutes * 60)
}

export function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00`).getDay() // 0 = Sunday
}
