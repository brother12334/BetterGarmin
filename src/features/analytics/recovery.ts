import { addDays } from '../../lib/dateRange'
import type { AnalyticsDataset, DayRecord } from './model'
import { classifyDeviations, median, robustBaseline, robustZ, DEVIATION_Z, type RobustBaseline } from './robust'

/**
 * Recovery indicators — deliberately NOT a single score. Each indicator is compared with its own personal baseline,
 * and the summary only counts how many independent indicators currently differ in the direction that is often (not
 * always) associated with less recovery. It diagnoses nothing.
 */

export type IndicatorKey = 'restingHr' | 'hrv' | 'sleepMinutes' | 'bedtime' | 'trainingFrequency' | 'feel'
export type IndicatorStatus = 'insufficient' | 'typical' | 'deviation' | 'sustained'

export interface Indicator {
  key: IndicatorKey
  label: string
  unit: string
  /** Median of the last 7 days (or the recent period for session-based indicators). */
  recent: number | null
  recentN: number
  baseline: RobustBaseline | null
  z: number | null
  status: IndicatorStatus
  direction: 'above' | 'below' | null
  /** Whether the current direction is the one commonly associated with less recovery. Null if neutral/typical. */
  lessRecoveredDirection: boolean | null
  /** Indicators without a recovery direction (e.g. training frequency) are context only. */
  contextOnly: boolean
  explanation: string
  series: { day: string; v: number | null }[]
}

export interface RecoverySummary {
  asOf: string
  indicators: Indicator[]
  available: number
  differingLessRecovered: number
  sustainedLessRecovered: number
  missing: string[]
  statement: string
}

const RECENT_DAYS = 7
const BASELINE_DAYS = 28
const MIN_RECENT = 4

interface DailySpec {
  key: Extract<IndicatorKey, 'restingHr' | 'hrv' | 'sleepMinutes' | 'bedtime'>
  label: string
  unit: string
  get: (d: DayRecord) => number | null
  /** +1 = higher than usual is the "less recovered" direction, −1 = lower is, 0 = neutral. */
  worseDirection: 1 | -1 | 0
  minSpread: number
  explanation: string
}

const DAILY: DailySpec[] = [
  { key: 'restingHr', label: 'Resting heart rate', unit: 'bpm', get: (d) => d.restingHr, worseDirection: 1, minSpread: 1, explanation: 'Often rises with accumulated training stress, poor sleep, alcohol, heat or illness — and also varies for no clear reason.' },
  { key: 'hrv', label: 'HRV (overnight)', unit: 'ms', get: (d) => d.hrv, worseDirection: -1, minSpread: 2, explanation: "Garmin's overnight average. Lower than your own normal often accompanies stress or fatigue; it is noisy day to day." },
  { key: 'sleepMinutes', label: 'Sleep duration', unit: 'min', get: (d) => d.sleepMinutes, worseDirection: -1, minSpread: 15, explanation: 'Total sleep from your watch. Shorter than your usual is the direction associated with less recovery.' },
  { key: 'bedtime', label: 'Bedtime', unit: 'h', get: (d) => d.bedtime, worseDirection: 0, minSpread: 0.25, explanation: 'When sleep started. Shown as context — a shift in routine, not good or bad by itself.' },
]

function windowValues(days: DayRecord[], get: (d: DayRecord) => number | null, from: string, to: string): number[] {
  return days.filter((d) => d.day >= from && d.day <= to).map(get).filter((v): v is number => v != null)
}

function statusFrom(z: number | null, sustained: boolean): IndicatorStatus {
  if (z == null) return 'insufficient'
  if (Math.abs(z) < DEVIATION_Z) return 'typical'
  return sustained ? 'sustained' : 'deviation'
}

export function computeRecovery(ds: AnalyticsDataset): RecoverySummary {
  const asOf = ds.lastDay
  const recentFrom = addDays(asOf, -(RECENT_DAYS - 1))
  const baseTo = addDays(recentFrom, -1)
  const baseFrom = addDays(baseTo, -(BASELINE_DAYS - 1))
  const indicators: Indicator[] = []

  for (const spec of DAILY) {
    const recentVals = windowValues(ds.days, spec.get, recentFrom, asOf)
    const baseline = robustBaseline(windowValues(ds.days, spec.get, baseFrom, baseTo))
    const recent = recentVals.length >= MIN_RECENT ? median(recentVals) : null
    const z = recent != null && baseline ? robustZ(recent, baseline, spec.minSpread) : null
    // Sustained = the daily classifier sees ≥3 of the last 5 measured days deviating the same way.
    const series = ds.days.filter((d) => d.day >= addDays(asOf, -89)).map((d) => ({ day: d.day, v: spec.get(d) }))
    const daily = classifyDeviations(series, BASELINE_DAYS, spec.minSpread)
    const last = [...daily].reverse().find((p) => p.v != null)
    const sustained = !!last && last.status === 'sustained' && z != null && Math.sign(last.z ?? 0) === Math.sign(z)
    const status = statusFrom(z, sustained)
    const direction = z == null || status === 'typical' ? null : z > 0 ? 'above' : 'below'
    indicators.push({
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      recent,
      recentN: recentVals.length,
      baseline,
      z,
      status,
      direction,
      lessRecoveredDirection: direction == null || spec.worseDirection === 0 ? null : (direction === 'above') === (spec.worseDirection === 1),
      contextOnly: spec.worseDirection === 0,
      explanation: spec.explanation,
      series,
    })
  }

  // Training frequency: sessions in the last 7 days vs the weekly counts of the previous 8 weeks. Context only.
  const weekCounts: number[] = []
  for (let w = 1; w <= 8; w++) {
    const to = addDays(recentFrom, -1 - (w - 1) * 7)
    const from = addDays(to, -6)
    weekCounts.push(ds.sessions.filter((s) => s.day >= from && s.day <= to).length)
  }
  const hasTrainingHistory = ds.sessions.some((s) => s.day < recentFrom)
  const freqBaseline = hasTrainingHistory ? robustBaseline(weekCounts, 6) : null
  const recentSessions = ds.sessions.filter((s) => s.day >= recentFrom).length
  const fz = freqBaseline ? robustZ(recentSessions, freqBaseline, 1) : null
  const fStatus = statusFrom(fz, false)
  indicators.push({
    key: 'trainingFrequency',
    label: 'Training frequency',
    unit: 'sessions/wk',
    recent: freqBaseline ? recentSessions : null,
    recentN: recentSessions,
    baseline: freqBaseline,
    z: fz,
    status: fStatus,
    direction: fz == null || fStatus === 'typical' ? null : fz > 0 ? 'above' : 'below',
    lessRecoveredDirection: null,
    contextOnly: true,
    explanation: 'Logged strength sessions in the last 7 days vs. your previous 8 weeks. Context for the other indicators.',
    series: [],
  })

  // Subjective feel (Element 26 rating or Garmin self-evaluation), session-based: last 3 vs earlier.
  const feels = ds.sessions.filter((s) => s.feel != null)
  const recentFeel = feels.slice(-3).map((s) => s.feel as number)
  const earlierFeel = feels.slice(0, -3).slice(-20).map((s) => s.feel as number)
  const feelBaseline = robustBaseline(earlierFeel, 5)
  const feelRecent = recentFeel.length === 3 ? median(recentFeel) : null
  const feelZ = feelRecent != null && feelBaseline ? robustZ(feelRecent, feelBaseline, 0.5) : null
  const feelStatus = statusFrom(feelZ, false)
  const feelDir = feelZ == null || feelStatus === 'typical' ? null : feelZ > 0 ? 'above' : 'below'
  indicators.push({
    key: 'feel',
    label: 'How sessions felt',
    unit: '/5',
    recent: feelRecent,
    recentN: recentFeel.length,
    baseline: feelBaseline,
    z: feelZ,
    status: feelStatus,
    direction: feelDir,
    lessRecoveredDirection: feelDir == null ? null : feelDir === 'below',
    contextOnly: false,
    explanation: 'Your own post-workout rating (Element 26 or Garmin), last 3 sessions vs. the 20 before.',
    series: [],
  })

  const directional = indicators.filter((i) => !i.contextOnly)
  const available = directional.filter((i) => i.status !== 'insufficient').length
  const differing = directional.filter((i) => i.lessRecoveredDirection === true).length
  const sustainedN = directional.filter((i) => i.lessRecoveredDirection === true && i.status === 'sustained').length
  const missing = indicators.filter((i) => i.status === 'insufficient').map((i) => i.label)

  let statement: string
  if (available === 0) statement = 'Not enough history yet to compare anything with your personal baseline.'
  else if (differing === 0) statement = `All ${available} available indicators are within your usual range.`
  else
    statement = `${differing} of ${available} available indicators differ from your baseline in the direction often associated with less recovery${
      sustainedN > 0 ? ` (${sustainedN} for several days running)` : ''
    }. This is a pattern in your data, not a diagnosis.`

  return { asOf, indicators, available, differingLessRecovered: differing, sustainedLessRecovered: sustainedN, missing, statement }
}
