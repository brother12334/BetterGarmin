// Days are 'YYYY-MM-DD'. GarminDB sometimes stores them with a time part ('2026-10-15 00:00:00'),
// which Safari refuses to parse, so only the date part is used, and all arithmetic is done in UTC
// so the result never shifts by a day in time zones ahead of UTC.
function parseDay(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day.trim())
  if (!m) throw new Error(`Unrecognised date "${day}"`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

const DAY_MS = 86_400_000

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Normalises a stored day value to 'YYYY-MM-DD', or null if it isn't a date. */
export function normalizeDay(day: string | null | undefined): string | null {
  if (day == null) return null
  try {
    return formatDay(parseDay(day))
  } catch {
    return null
  }
}

export function enumerateDays(startDay: string, endDay: string): string[] {
  const days: string[] = []
  const end = parseDay(endDay)
  for (let cur = parseDay(startDay); cur <= end; cur += DAY_MS) days.push(formatDay(cur))
  return days
}

export function addDays(day: string, delta: number): string {
  return formatDay(parseDay(day) + delta * DAY_MS)
}
