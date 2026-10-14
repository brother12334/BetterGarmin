import type { ActivityRecordRow } from '../../db/types'
import type { SetRecord, WorkoutRecord } from '../../db/strengthLog'
import { parseGarminTimestamp } from './matchGarminActivity'

/** Gaps shorter than this are normal recording variance; longer than this is treated as missing Garmin data. */
const GAP_THRESHOLD_MS = 60_000

export type SegmentType = 'warmup' | 'set' | 'rest' | 'transition' | 'cooldown'

export interface TimelineSegment {
  type: SegmentType
  startMs: number
  endMs: number
  exercise?: string
  setNumber?: number
  weight?: number | null
  reps?: number
  rpe?: number | null
  isWarmupSet?: boolean
  personalRecord?: boolean
  note?: string | null
  hrStart: number | null
  hrEnd: number | null
  hrAvg: number | null
  hrPeak: number | null
  hasGarminData: boolean
  stressAvg: number | null
  respirationAvg: number | null
}

export interface TimeRange {
  startMs: number
  endMs: number
}

export interface WorkoutTimeline {
  segments: TimelineSegment[]
  /** Spans with no Garmin HR data, for rendering a visible break instead of a connecting line or a guess. */
  gapRanges: TimeRange[]
  hrSeries: { t: number; v: number }[]
  totalMs: number
  setMs: number
  restMs: number
  transitionMs: number
  hrAvg: number | null
  hrPeak: number | null
  hrMin: number | null
  /** Time spent in 5 even bands of %-of-session-peak HR. Self-relative, not a clinical/age-based zone system. */
  effortBandsMs: number[]
}

interface Point {
  t: number
  v: number
}

function toSeries(records: ActivityRecordRow[], field: 'hr'): Point[] {
  const points: Point[] = []
  for (const r of records) {
    const t = parseGarminTimestamp(r.timestamp)
    const v = r[field]
    if (t == null || v == null) continue
    points.push({ t, v })
  }
  points.sort((a, b) => a.t - b.t)
  return points
}

function samplesToSeries(samples: { timestamp: string; value: number | null }[]): Point[] {
  const points: Point[] = []
  for (const s of samples) {
    const t = parseGarminTimestamp(s.timestamp)
    if (t == null || s.value == null) continue
    points.push({ t, v: s.value })
  }
  points.sort((a, b) => a.t - b.t)
  return points
}

function interpolateAt(series: Point[], t: number): number | null {
  if (series.length === 0) return null
  if (t <= series[0].t) return series[0].v
  const last = series[series.length - 1]
  if (t >= last.t) return last.v
  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i]
    const b = series[i + 1]
    if (t >= a.t && t <= b.t) {
      if (b.t - a.t > GAP_THRESHOLD_MS) return null
      if (b.t === a.t) return a.v
      const frac = (t - a.t) / (b.t - a.t)
      return Math.round(a.v + (b.v - a.v) * frac)
    }
  }
  return null
}

function statsForRange(series: Point[], startMs: number, endMs: number) {
  const inRange = series.filter((p) => p.t >= startMs && p.t <= endMs)
  if (inRange.length === 0) {
    return { avg: null as number | null, peak: null as number | null, start: interpolateAt(series, startMs), end: interpolateAt(series, endMs), hasData: false }
  }
  const avg = Math.round(inRange.reduce((s, p) => s + p.v, 0) / inRange.length)
  const peak = Math.max(...inRange.map((p) => p.v))
  return { avg, peak, start: inRange[0].v, end: inRange[inRange.length - 1].v, hasData: true }
}

function avgForRange(series: Point[], startMs: number, endMs: number): number | null {
  const inRange = series.filter((p) => p.t >= startMs && p.t <= endMs)
  if (inRange.length === 0) return null
  return Math.round((inRange.reduce((s, p) => s + p.v, 0) / inRange.length) * 10) / 10
}

function detectGaps(series: Point[], windowStart: number, windowEnd: number): TimeRange[] {
  const gaps: TimeRange[] = []
  if (series.length === 0) {
    gaps.push({ startMs: windowStart, endMs: windowEnd })
    return gaps
  }
  if (series[0].t - windowStart > GAP_THRESHOLD_MS) gaps.push({ startMs: windowStart, endMs: series[0].t })
  for (let i = 0; i < series.length - 1; i++) {
    const gapMs = series[i + 1].t - series[i].t
    if (gapMs > GAP_THRESHOLD_MS) gaps.push({ startMs: series[i].t, endMs: series[i + 1].t })
  }
  const lastT = series[series.length - 1].t
  if (windowEnd - lastT > GAP_THRESHOLD_MS) gaps.push({ startMs: lastT, endMs: windowEnd })
  return gaps
}

export interface BuildTimelineInput {
  workout: WorkoutRecord
  sets: SetRecord[]
  activityRecords: ActivityRecordRow[]
  stressSamples: { timestamp: string; stress: number | null }[]
  respirationSamples: { timestamp: string; rr: number | null }[]
}

/**
 * Merges a workout's logged sets with the matched Garmin activity's heart-rate (and, where available,
 * stress/respiration) stream into a continuous timeline of warmup/set/rest/transition/cooldown segments.
 *
 * Set boundaries are an ESTIMATE: Element 26 (and this app's own manual logger) only records the moment
 * a set was logged, not a separate start time. A set's start is inferred as (previous segment's end +
 * that set's reported rest-before-this-set), clamped to stay within the workout window — it is not a
 * directly measured boundary.
 */
export function buildWorkoutTimeline(input: BuildTimelineInput): WorkoutTimeline | null {
  const { workout, sets, activityRecords, stressSamples, respirationSamples } = input
  if (workout.startedAtEpochMs == null || workout.finishedAtEpochMs == null) return null
  const windowStart = workout.startedAtEpochMs
  const windowEnd = workout.finishedAtEpochMs

  const hrSeries = toSeries(activityRecords, 'hr')
  const stressSeries = samplesToSeries(stressSamples.map((s) => ({ timestamp: s.timestamp, value: s.stress })))
  const rrSeries = samplesToSeries(respirationSamples.map((s) => ({ timestamp: s.timestamp, value: s.rr })))

  const timedSets = [...sets]
    .filter((s) => s.atEpochMs != null)
    .sort((a, b) => (a.atEpochMs as number) - (b.atEpochMs as number))

  function makeSegment(type: SegmentType, startMs: number, endMs: number, extra: Partial<TimelineSegment> = {}): TimelineSegment {
    const hr = statsForRange(hrSeries, startMs, endMs)
    return {
      type,
      startMs,
      endMs,
      hrStart: hr.start,
      hrEnd: hr.end,
      hrAvg: hr.avg,
      hrPeak: hr.peak,
      hasGarminData: hr.hasData,
      stressAvg: avgForRange(stressSeries, startMs, endMs),
      respirationAvg: avgForRange(rrSeries, startMs, endMs),
      ...extra,
    }
  }

  const segments: TimelineSegment[] = []
  let cursor = windowStart
  let prevExercise: string | null = null

  for (const set of timedSets) {
    const setEnd = Math.min(Math.max(set.atEpochMs as number, cursor), windowEnd)
    const restBeforeMs = Math.max(0, (set.restSecondsBefore ?? 0) * 1000)
    const estimatedStart = Math.min(setEnd, Math.max(cursor, cursor + restBeforeMs))

    if (estimatedStart - cursor >= 1000) {
      const gapType: SegmentType = segments.length === 0 ? 'warmup' : prevExercise && prevExercise !== set.exercise ? 'transition' : 'rest'
      segments.push(makeSegment(gapType, cursor, estimatedStart))
    }

    segments.push(
      makeSegment('set', estimatedStart, setEnd, {
        exercise: set.exercise,
        setNumber: set.order + 1,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
        isWarmupSet: set.isWarmup,
        personalRecord: set.personalRecord,
        note: set.note,
      }),
    )

    cursor = setEnd
    prevExercise = set.exercise
  }

  if (windowEnd - cursor >= 1000) {
    segments.push(makeSegment('cooldown', cursor, windowEnd))
  }

  const gapRanges = detectGaps(hrSeries, windowStart, windowEnd)

  const setMs = segments.filter((s) => s.type === 'set').reduce((s, seg) => s + (seg.endMs - seg.startMs), 0)
  const restMs = segments.filter((s) => s.type === 'rest').reduce((s, seg) => s + (seg.endMs - seg.startMs), 0)
  const transitionMs = segments
    .filter((s) => s.type === 'warmup' || s.type === 'transition' || s.type === 'cooldown')
    .reduce((s, seg) => s + (seg.endMs - seg.startMs), 0)

  const whole = statsForRange(hrSeries, windowStart, windowEnd)
  const hrMin = hrSeries.length > 0 ? Math.min(...hrSeries.filter((p) => p.t >= windowStart && p.t <= windowEnd).map((p) => p.v)) : null

  const effortBandsMs = [0, 0, 0, 0, 0]
  if (whole.peak != null && whole.peak > 0) {
    for (let i = 0; i < hrSeries.length - 1; i++) {
      const a = hrSeries[i]
      const b = hrSeries[i + 1]
      if (a.t < windowStart || b.t > windowEnd) continue
      const dt = b.t - a.t
      if (dt <= 0 || dt > GAP_THRESHOLD_MS) continue
      const pct = ((a.v + b.v) / 2 / whole.peak) * 100
      const band = Math.min(4, Math.floor(pct / 20))
      effortBandsMs[band] += dt
    }
  }

  return {
    segments,
    gapRanges,
    hrSeries,
    totalMs: windowEnd - windowStart,
    setMs,
    restMs,
    transitionMs,
    hrAvg: whole.avg,
    hrPeak: whole.peak,
    hrMin,
    effortBandsMs,
  }
}
