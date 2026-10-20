import { mad, median } from '../analytics/robust'
import type { DayRecord } from '../analytics/model'

/**
 * Shared intelligence infrastructure: which markers exist (capability registry), personal baselines, trend
 * statistics and confidence. Every feature reads through this, so none of them invents data or confidence.
 */

// ---- Markers and capability registry -----------------------------------------------------------------------

export type MarkerKey = 'restingHr' | 'hrv' | 'sleepMinutes' | 'sleepScore' | 'sleepTiming' | 'awake' | 'steps' | 'stress' | 'spo2' | 'respiration'

export type Provenance = 'device' | 'garmin-derived' | 'betterGarmin'

export interface MarkerInfo {
  key: MarkerKey
  label: string
  unit: string
  /** Direct sensor measurement, a value Garmin's firmware/cloud calculates, or something BetterGarmin derives. */
  provenance: Provenance
  get: (d: DayRecord) => number | null
  /** +1 if higher is generally the more recovered direction for this marker, -1 if lower, 0 if neither. */
  recoveredDirection: 1 | -1 | 0
}

const hours = (ms: number | null | undefined) => (ms == null ? null : ms)

export const MARKERS: MarkerInfo[] = [
  { key: 'restingHr', label: 'Resting heart rate', unit: 'bpm', provenance: 'garmin-derived', get: (d) => d.restingHr, recoveredDirection: -1 },
  { key: 'hrv', label: 'Overnight HRV', unit: 'ms', provenance: 'garmin-derived', get: (d) => d.hrv, recoveredDirection: 1 },
  { key: 'sleepMinutes', label: 'Sleep duration', unit: 'min', provenance: 'garmin-derived', get: (d) => d.sleepMinutes, recoveredDirection: 1 },
  { key: 'sleepScore', label: 'Sleep score', unit: '', provenance: 'garmin-derived', get: (d) => d.sleepScore, recoveredDirection: 1 },
  { key: 'sleepTiming', label: 'Sleep timing', unit: 'h', provenance: 'garmin-derived', get: (d) => hours(d.sleepStartMs) != null ? 1 : null, recoveredDirection: 0 },
  { key: 'awake', label: 'Awake time in bed', unit: 'min', provenance: 'garmin-derived', get: (d) => d.awakeMinutes ?? null, recoveredDirection: -1 },
  { key: 'steps', label: 'Steps', unit: '', provenance: 'device', get: (d) => d.steps, recoveredDirection: 0 },
  { key: 'stress', label: 'Garmin stress (daily average)', unit: '', provenance: 'garmin-derived', get: (d) => d.stressAvg, recoveredDirection: -1 },
  { key: 'spo2', label: 'Blood oxygen', unit: '%', provenance: 'device', get: (d) => d.spo2Avg ?? null, recoveredDirection: 1 },
  { key: 'respiration', label: 'Respiration', unit: 'br/min', provenance: 'garmin-derived', get: (d) => d.respirationAvg ?? null, recoveredDirection: -1 },
]

export const marker = (k: MarkerKey) => MARKERS.find((m) => m.key === k)!

export interface Capability {
  key: MarkerKey
  /** Valid days in the last 30. */
  recentDays: number
  totalDays: number
  latestDay: string | null
  available: boolean
}

/** What this user's data actually contains, so features switch themselves on or off. */
export function capabilities(days: DayRecord[]): Record<MarkerKey, Capability> {
  const last30 = days.slice(-30)
  const out = {} as Record<MarkerKey, Capability>
  for (const m of MARKERS) {
    const valid = days.filter((d) => isValid(m.get(d)))
    out[m.key] = {
      key: m.key,
      recentDays: last30.filter((d) => isValid(m.get(d))).length,
      totalDays: valid.length,
      latestDay: valid.length ? valid[valid.length - 1].day : null,
      available: valid.length > 0,
    }
  }
  return out
}

const isValid = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0

// ---- Statistics ------------------------------------------------------------------------------------------

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

export function sd(xs: number[]): number | null {
  const m = mean(xs)
  if (m == null || xs.length < 2) return null
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

/** Theil–Sen slope (median of pairwise slopes): robust to the odd bad night. Units per x-unit. */
export function theilSen(points: [number, number][]): number | null {
  if (points.length < 3) return null
  const slopes: number[] = []
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) if (points[j][0] !== points[i][0]) slopes.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]))
  return median(slopes)
}

// ---- Personal baselines ----------------------------------------------------------------------------------

export interface Baseline {
  median: number
  /** Median absolute deviation, scaled ×1.4826 to be comparable with a standard deviation. */
  spread: number
  mean: number
  sd: number | null
  n: number
  /** Share of days in the window with a valid value. */
  coverage: number
}

/** Engineering starting point: 21 valid days within the window before a baseline is trusted. */
export const MIN_BASELINE_DAYS = 21

/**
 * Baseline from the `windowDays` days before `endIndex` (exclusive), so "today" is never compared with itself.
 * `minSpread` stops a very stable marker from turning tiny changes into large deviations.
 */
export function baselineAt(days: DayRecord[], m: MarkerInfo, endIndex: number, windowDays = 28, minSpread = 0): Baseline | null {
  const window = days.slice(Math.max(0, endIndex - windowDays), endIndex)
  const vals = window.map(m.get).filter(isValid)
  if (vals.length < Math.min(MIN_BASELINE_DAYS, Math.ceil(windowDays * 0.75))) return null
  const med = median(vals)!
  const spread = Math.max((mad(vals) ?? 0) * 1.4826, minSpread)
  return { median: med, spread, mean: mean(vals)!, sd: sd(vals), n: vals.length, coverage: vals.length / window.length }
}

export function z(value: number, b: Baseline): number {
  return b.spread > 0 ? (value - b.median) / b.spread : 0
}

/** Floors for spread, from typical day-to-day noise of each marker, so ordinary wobble isn't called a deviation. */
export const MIN_SPREAD: Partial<Record<MarkerKey, number>> = { restingHr: 1.5, hrv: 3, sleepMinutes: 25, respiration: 0.5, spo2: 0.5, awake: 10 }

// ---- Confidence ------------------------------------------------------------------------------------------

export type Confidence = 'insufficient' | 'low' | 'moderate' | 'high'

/** Confidence from how much valid data a conclusion rests on: baseline size and recent coverage. */
export function confidenceFrom(baselineN: number, recentValid: number, recentNeeded: number): Confidence {
  if (baselineN < MIN_BASELINE_DAYS || recentValid < Math.ceil(recentNeeded / 2)) return 'insufficient'
  if (baselineN >= 56 && recentValid >= recentNeeded) return 'high'
  if (baselineN >= 28 && recentValid >= Math.ceil(recentNeeded * 0.75)) return 'moderate'
  return 'low'
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000)
}
