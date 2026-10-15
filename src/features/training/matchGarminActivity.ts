import type { ActivityRow } from '../../db/types'

/** GarminDB stores naive "YYYY-MM-DD HH:MM:SS" timestamps with no timezone — treated as the browser's local time, same convention used everywhere else in this app. */
export function parseGarminTimestamp(ts: string | null | undefined): number | null {
  if (!ts) return null
  const t = new Date(ts.replace(' ', 'T')).getTime()
  return Number.isFinite(t) ? t : null
}

/** How far apart two windows' edges can be and still count as "probably the same workout" — covers clock drift and a few minutes of lag starting/stopping either app. */
const MATCH_TOLERANCE_MS = 15 * 60 * 1000

interface TimedWorkout {
  startedAtEpochMs?: number | null
  finishedAtEpochMs?: number | null
}

/**
 * Finds the Garmin activity that best matches a workout's time window: prefers one that actually
 * overlaps (by the most overlap), falls back to the closest one within tolerance, and tie-breaks
 * toward a watch-recorded strength_training session over some other activity type.
 */
export function matchGarminActivity(workout: TimedWorkout, activities: ActivityRow[]): ActivityRow | null {
  if (workout.startedAtEpochMs == null || workout.finishedAtEpochMs == null) return null
  const wStart = workout.startedAtEpochMs
  const wEnd = workout.finishedAtEpochMs

  let best: { activity: ActivityRow; score: number } | null = null
  for (const a of activities) {
    const aStart = parseGarminTimestamp(a.start_time)
    if (aStart == null) continue
    const aEnd = parseGarminTimestamp(a.stop_time) ?? aStart

    const overlapMs = Math.max(0, Math.min(aEnd, wEnd) - Math.max(aStart, wStart))
    let score: number
    if (overlapMs > 0) {
      score = 1_000_000 + overlapMs
    } else {
      const gap = aStart > wEnd ? aStart - wEnd : wStart - aEnd
      if (gap > MATCH_TOLERANCE_MS) continue
      score = -gap
    }
    if (a.sub_sport === 'strength_training' || a.sport === 'strength_training') score += 500_000

    if (!best || score > best.score) best = { activity: a, score }
  }
  return best?.activity ?? null
}

export interface OffsetSuggestion {
  offsetMs: number
  activity: ActivityRow
  /** Fraction of the workout window covered by the activity after shifting. */
  overlap: number
}

const isStrength = (a: ActivityRow) => a.sub_sport === 'strength_training' || a.sport === 'strength_training'
const STEP_MS = 30 * 60 * 1000
const MAX_SHIFT_STEPS = 28 // ±14 h covers every real time zone

function overlapFraction(start: number, end: number, a: ActivityRow): number {
  const aStart = parseGarminTimestamp(a.start_time)
  if (aStart == null) return 0
  const aEnd = parseGarminTimestamp(a.stop_time) ?? aStart
  return Math.max(0, Math.min(aEnd, end) - Math.max(aStart, start)) / Math.max(1, end - start)
}

/**
 * When a workout's logged times don't overlap any watch-recorded strength activity, tries whole and half-hour
 * shifts (time-zone mistakes) and returns one only if it clearly lines up: ≥ 60% overlap, and no other shift does
 * nearly as well. Returns null when the current times already overlap a strength activity.
 */
export function suggestClockOffset(workout: { startedAtEpochMs: number; finishedAtEpochMs: number }, activities: ActivityRow[]): OffsetSuggestion | null {
  const strength = activities.filter(isStrength)
  const { startedAtEpochMs: s, finishedAtEpochMs: e } = workout
  if (strength.some((a) => overlapFraction(s, e, a) > 0)) return null
  const scored: OffsetSuggestion[] = []
  for (let k = -MAX_SHIFT_STEPS; k <= MAX_SHIFT_STEPS; k++) {
    if (k === 0) continue
    const off = k * STEP_MS
    for (const a of strength) {
      const f = overlapFraction(s + off, e + off, a)
      if (f > 0) scored.push({ offsetMs: off, activity: a, overlap: f })
    }
  }
  scored.sort((x, y) => y.overlap - x.overlap || Math.abs(x.offsetMs) - Math.abs(y.offsetMs))
  const best = scored[0]
  if (!best || best.overlap < 0.6) return null
  const rival = scored.find((x) => x.activity.activity_id !== best.activity.activity_id && x.overlap >= best.overlap - 0.1)
  return rival ? null : best
}
