/** Parses a GarminDB "HH:MM:SS" duration string into minutes. */
export function hmsToMinutes(hms: string | null | undefined): number | null {
  if (!hms) return null
  const parts = hms.split(':').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const [h, m, s] = parts
  return h * 60 + m + s / 60
}

export function formatHoursMinutes(totalMinutes: number | null): string {
  if (totalMinutes == null) return '—'
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  return `${h}h ${m}m`
}
