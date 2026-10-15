import type { SetRecord } from '../../db/strengthLog'

/**
 * Workout ↔ heart-rate alignment engine.
 *
 * Everything here is a pure function of (workout window, sets, user corrections, clock offset, HR samples),
 * so results are reproducible and recomputed from scratch whenever any input changes.
 *
 * Boundary provenance matters: Element 26 records ONE timestamp per set (when it was logged, ≈ set end).
 * A set's start is therefore estimated unless the user corrected it, and every derived number carries
 * how its window was obtained and how much of that window actually has HR samples.
 */

export const ALIGNMENT_VERSION = 2

/** Gaps between consecutive samples longer than this are treated as missing data, never interpolated across. */
export const GAP_THRESHOLD_MS = 60_000
/** Window before a set used for "HR before the set". */
export const PRE_SET_WINDOW_MS = 15_000
/** How far from a target instant a sample may be and still count as "HR at that point". */
export const POINT_TOLERANCE_MS = 5_000
/** Rest checkpoints, measured from the end of the preceding set. */
export const REST_CHECKPOINTS_S = [30, 60] as const
/** "Returned toward pre-set HR" = within this many bpm of the preceding set's pre-set HR. */
export const RETURN_MARGIN_BPM = 10
/** Used only when a set has neither a rest value nor a correction: rough set duration estimate. */
const DEFAULT_SET_MS = 40_000
/** Estimated sets longer than this almost always mean the reported rest was shorter than the real one. */
export const MAX_PLAUSIBLE_SET_MS = 120_000
const MIN_PLAUSIBLE_BPM = 30
const MAX_PLAUSIBLE_BPM = 230

export type SegmentType = 'warmup' | 'set' | 'rest' | 'transition' | 'cooldown'
export type BoundarySource = 'logged' | 'corrected' | 'estimated-from-rest' | 'estimated-default' | 'clamped'
export type Confidence = 'high' | 'medium' | 'low' | 'none'

export interface HrSample {
  t: number
  v: number
}

export interface SetCorrection {
  setId: string
  startMs?: number | null
  endMs?: number | null
}

export interface IntervalStats {
  n: number
  avg: number | null
  peak: number | null
  min: number | null
  first: number | null
  last: number | null
  /** Fraction (0-1) of the interval covered by samples spaced ≤ GAP_THRESHOLD_MS apart. */
  coverage: number
}

export interface RestAnalysis {
  durationMs: number
  hrAtStart: number | null
  /** HR at each checkpoint (seconds after rest start), null if no sample within tolerance or rest too short. */
  checkpoints: { seconds: number; hr: number | null }[]
  /** HR fall over the first 60s of rest. Only when both endpoints were measured and rest lasted ≥ 60s. */
  drop60: number | null
  /** Seconds until HR first came within RETURN_MARGIN_BPM of the preceding set's pre-set HR, if it did during this rest. */
  secondsToReturn: number | null
  returnTarget: number | null
  stats: IntervalStats
}

export interface SetAnalysis {
  set: SetRecord
  setNumberInExercise: number
  startMs: number
  endMs: number
  startSource: BoundarySource
  endSource: BoundarySource
  durationMs: number
  volumeKg: number | null
  preSetHr: number | null
  stats: IntervalStats
  hrChange: number | null
  confidence: Confidence
  /** The rest that followed this set (before the next set), if any. */
  restAfter: RestAnalysis | null
  issues: string[]
}

export interface TimelineSegment {
  type: SegmentType
  startMs: number
  endMs: number
  /** Index into WorkoutTimeline.sets for set segments, and for rest segments the set the rest follows. */
  setIndex?: number
  exercise?: string
  stats: IntervalStats
}

export interface TimeRange {
  startMs: number
  endMs: number
}

export interface DataQuality {
  hrCoverage: number
  sampleCount: number
  medianSampleIntervalMs: number | null
  droppedSamples: number
  duplicateSamples: number
  estimatedStarts: number
  correctedBoundaries: number
  untimedSets: number
  overlaps: number
  clockOffsetMs: number
  issues: string[]
}

export interface WorkoutTimeline {
  version: number
  windowStart: number
  windowEnd: number
  segments: TimelineSegment[]
  sets: SetAnalysis[]
  gapRanges: TimeRange[]
  hrSeries: HrSample[]
  totalMs: number
  setMs: number
  restMs: number
  transitionMs: number
  hrAvg: number | null
  hrPeak: number | null
  hrMin: number | null
  /** Time in 5 even bands of %-of-session-peak HR. Self-relative, not a clinical zone system. */
  effortBandsMs: number[]
  quality: DataQuality
}

export interface BuildTimelineInput {
  startedAtEpochMs: number
  finishedAtEpochMs: number
  sets: SetRecord[]
  hrSamples: HrSample[]
  corrections?: SetCorrection[]
  /** Added to every workout-side timestamp (logger clock → watch clock). */
  clockOffsetMs?: number
}

export function cleanSamples(samples: HrSample[]): { series: HrSample[]; dropped: number; duplicates: number } {
  let dropped = 0
  let duplicates = 0
  const sorted = samples
    .filter((s) => {
      const ok = Number.isFinite(s.t) && Number.isFinite(s.v) && s.v >= MIN_PLAUSIBLE_BPM && s.v <= MAX_PLAUSIBLE_BPM
      if (!ok) dropped++
      return ok
    })
    .sort((a, b) => a.t - b.t)
  const series: HrSample[] = []
  for (const s of sorted) {
    if (series.length > 0 && series[series.length - 1].t === s.t) {
      duplicates++
      continue
    }
    series.push(s)
  }
  return { series, dropped, duplicates }
}

function lowerBound(series: HrSample[], t: number): number {
  let lo = 0
  let hi = series.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (series[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Half-open [start, end) so a sample on a shared boundary belongs to exactly one segment. */
function samplesIn(series: HrSample[], start: number, end: number): HrSample[] {
  const out: HrSample[] = []
  for (let i = lowerBound(series, start); i < series.length && series[i].t < end; i++) out.push(series[i])
  return out
}

/** Nearest sample to t within tolerance — never interpolated. */
export function sampleNear(series: HrSample[], t: number, toleranceMs = POINT_TOLERANCE_MS): number | null {
  const i = lowerBound(series, t)
  let best: HrSample | null = null
  for (const j of [i - 1, i]) {
    const s = series[j]
    if (!s) continue
    if (Math.abs(s.t - t) <= toleranceMs && (!best || Math.abs(s.t - t) < Math.abs(best.t - t))) best = s
  }
  return best ? best.v : null
}

/** Most recent sample at or before t, if it is within the gap threshold — a real reading and its age, never interpolated. */
export function latestSample(series: HrSample[], t: number): { v: number; ageMs: number } | null {
  const i = lowerBound(series, t + 1) - 1
  if (i < 0) return null
  const ageMs = t - series[i].t
  return ageMs <= GAP_THRESHOLD_MS ? { v: series[i].v, ageMs } : null
}

export function coverageOf(series: HrSample[], start: number, end: number): number {
  const span = end - start
  if (span <= 0) return 0
  const inside = samplesIn(series, start, end)
  if (inside.length === 0) return 0
  // Each sample covers half the way to each neighbour, but nothing across a stretch that counts as a gap,
  // so coverage agrees with detectGaps. At the interval edges it covers up to half the gap threshold.
  const half = GAP_THRESHOLD_MS / 2
  const side = (dist: number) => (dist > GAP_THRESHOLD_MS ? 0 : dist / 2)
  let covered = 0
  for (let k = 0; k < inside.length; k++) {
    const t = inside[k].t
    const left = k > 0 ? side(t - inside[k - 1].t) : Math.min(t - start, half)
    const right = k < inside.length - 1 ? side(inside[k + 1].t - t) : Math.min(end - t, half)
    covered += left + right
  }
  return Math.max(0, Math.min(1, covered / span))
}

export function statsFor(series: HrSample[], start: number, end: number): IntervalStats {
  const inside = samplesIn(series, start, end)
  if (inside.length === 0) return { n: 0, avg: null, peak: null, min: null, first: null, last: null, coverage: 0 }
  const values = inside.map((s) => s.v)
  return {
    n: inside.length,
    avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
    peak: Math.max(...values),
    min: Math.min(...values),
    first: values[0],
    last: values[values.length - 1],
    coverage: coverageOf(series, start, end),
  }
}

export function detectGaps(series: HrSample[], windowStart: number, windowEnd: number): TimeRange[] {
  const inside = samplesIn(series, windowStart, windowEnd)
  if (inside.length === 0) return [{ startMs: windowStart, endMs: windowEnd }]
  const gaps: TimeRange[] = []
  if (inside[0].t - windowStart > GAP_THRESHOLD_MS) gaps.push({ startMs: windowStart, endMs: inside[0].t })
  for (let i = 0; i < inside.length - 1; i++) {
    if (inside[i + 1].t - inside[i].t > GAP_THRESHOLD_MS) gaps.push({ startMs: inside[i].t, endMs: inside[i + 1].t })
  }
  const last = inside[inside.length - 1].t
  if (windowEnd - last > GAP_THRESHOLD_MS) gaps.push({ startMs: last, endMs: windowEnd })
  return gaps
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function confidenceFor(startSource: BoundarySource, endSource: BoundarySource, coverage: number, n: number): Confidence {
  if (n === 0) return 'none'
  const boundariesKnown = (startSource === 'corrected' || startSource === 'logged') && (endSource === 'corrected' || endSource === 'logged')
  if (coverage >= 0.8 && boundariesKnown) return 'high'
  if (coverage >= 0.8 && startSource === 'estimated-from-rest') return 'medium'
  if (coverage >= 0.5) return 'low'
  return 'low'
}

function analyseRest(series: HrSample[], start: number, end: number, preSetHrOfPreviousSet: number | null): RestAnalysis {
  const durationMs = Math.max(0, end - start)
  const hrAtStart = sampleNear(series, start)
  const checkpoints = REST_CHECKPOINTS_S.map((seconds) => ({
    seconds,
    hr: durationMs >= seconds * 1000 ? sampleNear(series, start + seconds * 1000) : null,
  }))
  const at60 = checkpoints.find((c) => c.seconds === 60)?.hr ?? null
  const drop60 = hrAtStart != null && at60 != null ? hrAtStart - at60 : null

  let secondsToReturn: number | null = null
  const returnTarget = preSetHrOfPreviousSet != null ? preSetHrOfPreviousSet + RETURN_MARGIN_BPM : null
  if (returnTarget != null) {
    const hit = samplesIn(series, start, end).find((s) => s.v <= returnTarget)
    if (hit) secondsToReturn = Math.round((hit.t - start) / 1000)
  }
  return { durationMs, hrAtStart, checkpoints, drop60, secondsToReturn, returnTarget, stats: statsFor(series, start, end) }
}

export function buildWorkoutTimeline(input: BuildTimelineInput): WorkoutTimeline | null {
  const offset = input.clockOffsetMs ?? 0
  const windowStart = input.startedAtEpochMs + offset
  const windowEnd = input.finishedAtEpochMs + offset
  if (!(windowEnd > windowStart)) return null

  const { series, dropped, duplicates } = cleanSamples(input.hrSamples)
  const corrections = new Map((input.corrections ?? []).map((c) => [c.setId, c]))
  const issues: string[] = []

  const untimed = input.sets.filter((s) => s.atEpochMs == null && corrections.get(s.id)?.endMs == null)
  const timed = input.sets
    .filter((s) => !untimed.includes(s))
    .map((s) => {
      const c = corrections.get(s.id)
      const end = c?.endMs != null ? c.endMs + offset : (s.atEpochMs as number) + offset
      return { set: s, end, endSource: (c?.endMs != null ? 'corrected' : 'logged') as BoundarySource, corr: c }
    })
    .sort((a, b) => a.end - b.end || a.set.order - b.set.order)

  if (timed.length === 0) return null
  if (untimed.length > 0) issues.push(`${untimed.length} set(s) have no timestamp and are not placed on the timeline.`)

  const perExerciseCount = new Map<string, number>()
  const sets: SetAnalysis[] = []
  let cursor = windowStart
  let overlaps = 0
  let estimatedStarts = 0
  let correctedBoundaries = 0

  for (const t of timed) {
    const setIssues: string[] = []
    let end = t.end
    let endSource = t.endSource
    if (end > windowEnd) {
      end = windowEnd
      endSource = 'clamped'
      setIssues.push('Logged after the workout ended; clamped to the end.')
    }
    if (end < windowStart) {
      end = windowStart
      endSource = 'clamped'
      setIssues.push('Logged before the workout started; clamped to the start.')
    }

    let start: number
    let startSource: BoundarySource
    if (t.corr?.startMs != null) {
      start = t.corr.startMs + offset
      startSource = 'corrected'
    } else if (t.set.restSecondsBefore != null) {
      start = cursor + t.set.restSecondsBefore * 1000
      startSource = 'estimated-from-rest'
    } else {
      start = end - DEFAULT_SET_MS
      startSource = 'estimated-default'
    }

    if (start < cursor) {
      if (startSource === 'corrected') {
        overlaps++
        setIssues.push('Corrected start overlaps the previous set.')
      } else {
        start = cursor
        startSource = 'clamped'
      }
    }
    if (start >= end) {
      // Reported rest leaves no time for the set itself — the logged time and reported rest disagree.
      start = Math.max(cursor, end - 1000)
      startSource = 'clamped'
      setIssues.push('Reported rest and logged time leave no room for this set; start is a placeholder.')
    }
    const implausible = startSource !== 'corrected' && end - start > MAX_PLAUSIBLE_SET_MS
    if (implausible) {
      setIssues.push(
        `Estimated set length is ${Math.round((end - start) / 1000)}s — the reported rest is probably shorter than the real one. Correct the start if you know it.`,
      )
    }
    if (startSource.startsWith('estimated') || startSource === 'clamped') estimatedStarts++
    if (startSource === 'corrected') correctedBoundaries++
    if (endSource === 'corrected') correctedBoundaries++

    const stats = statsFor(series, start, end)
    const preSet = statsFor(series, start - PRE_SET_WINDOW_MS, start)
    const n = (perExerciseCount.get(t.set.exercise) ?? 0) + 1
    perExerciseCount.set(t.set.exercise, n)

    sets.push({
      set: t.set,
      setNumberInExercise: n,
      startMs: start,
      endMs: end,
      startSource,
      endSource,
      durationMs: end - start,
      volumeKg: t.set.weight != null ? Math.round(t.set.weight * t.set.reps * 10) / 10 : null,
      preSetHr: preSet.avg,
      stats,
      hrChange: stats.first != null && stats.last != null ? stats.last - stats.first : null,
      confidence: implausible && stats.n > 0 ? 'low' : confidenceFor(startSource, endSource, stats.coverage, stats.n),
      restAfter: null,
      issues: setIssues,
    })
    cursor = Math.max(cursor, end)
  }

  const segments: TimelineSegment[] = []
  const firstStart = sets[0].startMs
  if (firstStart - windowStart >= 1000) segments.push({ type: 'warmup', startMs: windowStart, endMs: firstStart, stats: statsFor(series, windowStart, firstStart) })
  sets.forEach((s, i) => {
    segments.push({ type: 'set', startMs: s.startMs, endMs: s.endMs, setIndex: i, exercise: s.set.exercise, stats: s.stats })
    const next = sets[i + 1]
    if (next && next.startMs - s.endMs >= 1000) {
      const type: SegmentType = next.set.exercise !== s.set.exercise ? 'transition' : 'rest'
      s.restAfter = analyseRest(series, s.endMs, next.startMs, s.preSetHr)
      segments.push({ type, startMs: s.endMs, endMs: next.startMs, setIndex: i, stats: s.restAfter.stats })
    }
  })
  const lastEnd = sets[sets.length - 1].endMs
  if (windowEnd - lastEnd >= 1000) segments.push({ type: 'cooldown', startMs: lastEnd, endMs: windowEnd, stats: statsFor(series, lastEnd, windowEnd) })

  const sum = (types: SegmentType[]) => segments.filter((s) => types.includes(s.type)).reduce((a, s) => a + (s.endMs - s.startMs), 0)
  const whole = statsFor(series, windowStart, windowEnd)
  const gapRanges = detectGaps(series, windowStart, windowEnd)
  const inWindow = samplesIn(series, windowStart, windowEnd)
  const intervals: number[] = []
  for (let i = 1; i < inWindow.length; i++) intervals.push(inWindow[i].t - inWindow[i - 1].t)

  const effortBandsMs = [0, 0, 0, 0, 0]
  if (whole.peak) {
    for (let i = 0; i < inWindow.length - 1; i++) {
      const a = inWindow[i]
      const b = inWindow[i + 1]
      const dt = b.t - a.t
      if (dt <= 0 || dt > GAP_THRESHOLD_MS) continue
      effortBandsMs[Math.min(4, Math.floor((((a.v + b.v) / 2) / whole.peak) * 5))] += dt
    }
  }

  if (whole.n === 0) issues.push('No heart-rate samples fall inside this workout window.')
  else if (whole.coverage < 0.8) issues.push(`Heart rate covers only ${Math.round(whole.coverage * 100)}% of the workout.`)
  if (estimatedStarts > 0) issues.push(`${estimatedStarts} set start(s) are estimated, not measured.`)
  const longSets = sets.filter((x) => x.startSource !== 'corrected' && x.durationMs > MAX_PLAUSIBLE_SET_MS).length
  if (longSets > 0) issues.push(`${longSets} set(s) have an implausibly long estimated duration — their HR stats include rest time.`)
  if (overlaps > 0) issues.push(`${overlaps} corrected set(s) overlap the previous set.`)
  if (dropped > 0) issues.push(`${dropped} implausible HR sample(s) were excluded.`)

  return {
    version: ALIGNMENT_VERSION,
    windowStart,
    windowEnd,
    segments,
    sets,
    gapRanges,
    hrSeries: inWindow,
    totalMs: windowEnd - windowStart,
    setMs: sum(['set']),
    restMs: sum(['rest']),
    transitionMs: sum(['warmup', 'transition', 'cooldown']),
    hrAvg: whole.avg,
    hrPeak: whole.peak,
    hrMin: whole.min,
    effortBandsMs,
    quality: {
      hrCoverage: whole.coverage,
      sampleCount: inWindow.length,
      medianSampleIntervalMs: median(intervals),
      droppedSamples: dropped,
      duplicateSamples: duplicates,
      estimatedStarts,
      correctedBoundaries,
      untimedSets: untimed.length,
      overlaps,
      clockOffsetMs: offset,
      issues,
    },
  }
}
