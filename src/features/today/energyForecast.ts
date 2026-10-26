/**
 * Energy forecast for the rest of today, built only from your own past days. For every past day with readings at
 * this hour, it takes how much the band's energy (Body Battery) went up or down from this hour to each later hour,
 * and adds those changes to the level you're at now. The middle line is the median change; the band is the middle
 * half of past days (25th to 75th percentile). No fixed drain rates or formulas: with too few comparable days, an
 * hour is left out rather than guessed.
 */

export interface EnergySample {
  /** Local time, 'YYYY-MM-DD HH:MM:SS'. */
  timestamp: string
  value: number
}

export interface ForecastPoint {
  /** Hour of the day, 0–23 (the level at the end of that hour). */
  hour: number
  low: number
  mid: number
  high: number
  /** How many past days this hour is based on. */
  days: number
}

export interface EnergyForecast {
  now: { hour: number; value: number }
  points: ForecastPoint[]
  /** Past days that had a reading at the current hour. */
  daysUsed: number
}

/** The fewest past days an hour needs before it's shown. */
export const MIN_DAYS = 5

/** Each day's level per hour: the last reading in that hour. */
function hourly(samples: EnergySample[]): Map<string, Map<number, number>> {
  const days = new Map<string, Map<number, number>>()
  for (const s of [...samples].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const day = s.timestamp.slice(0, 10)
    const hour = Number(s.timestamp.slice(11, 13))
    if (!days.has(day)) days.set(day, new Map())
    days.get(day)!.set(hour, s.value)
  }
  return days
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)))

export function forecastEnergy(samples: EnergySample[], today: string): EnergyForecast | null {
  const days = hourly(samples)
  const todayHours = days.get(today)
  if (!todayHours?.size) return null
  const nowHour = Math.max(...todayHours.keys())
  const nowValue = todayHours.get(nowHour)!

  const past = [...days.entries()].filter(([d, h]) => d < today && h.has(nowHour))
  const points: ForecastPoint[] = []
  for (let hour = nowHour + 1; hour < 24; hour++) {
    const changes = past.filter(([, h]) => h.has(hour)).map(([, h]) => h.get(hour)! - h.get(nowHour)!)
    if (changes.length < MIN_DAYS) continue
    changes.sort((a, b) => a - b)
    points.push({
      hour,
      low: clamp(nowValue + quantile(changes, 0.25)),
      mid: clamp(nowValue + quantile(changes, 0.5)),
      high: clamp(nowValue + quantile(changes, 0.75)),
      days: changes.length,
    })
  }
  return { now: { hour: nowHour, value: nowValue }, points, daysUsed: past.length }
}
