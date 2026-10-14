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
