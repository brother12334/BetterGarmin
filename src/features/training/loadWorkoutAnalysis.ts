import { getCorrections, type WorkoutWithSets } from '../../db/strengthLog'
import { getActivitiesRange, getActivityRecords, getMonitoringHrForDay } from '../../db/queries'
import type { ActivityRow, DbKind } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { matchGarminActivity, parseGarminTimestamp } from './matchGarminActivity'
import { buildWorkoutTimeline, type HrSample, type SetCorrection, type WorkoutTimeline } from './workoutTimeline'

/** Where the HR trace came from. 'activity' = the watch's recorded activity (dense); 'monitoring' = all-day HR (coarse, ~1-2 min). */
export type HrSource = 'activity' | 'monitoring' | 'none'

export interface WorkoutAnalysis {
  matchedActivity: ActivityRow | null
  hrSource: HrSource
  timeline: WorkoutTimeline | null
  corrections: SetCorrection[]
  clockOffsetMs: number
}

function toSamples(rows: { timestamp: string | null; v: number | null }[]): HrSample[] {
  const out: HrSample[] = []
  for (const r of rows) {
    const t = parseGarminTimestamp(r.timestamp)
    if (t != null && r.v != null) out.push({ t, v: r.v })
  }
  return out
}

function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The single path every feature uses to align a workout with Garmin HR — corrections and clock offset included. */
export async function loadWorkoutAnalysis(workout: WorkoutWithSets, loadedKinds: DbKind[]): Promise<WorkoutAnalysis> {
  const correctionRecords = await getCorrections(workout.id)
  const clockOffsetMs = correctionRecords.find((c) => c.id === `workout:${workout.id}`)?.clockOffsetMs ?? 0
  const corrections: SetCorrection[] = correctionRecords
    .filter((c) => c.setId)
    .map((c) => ({ setId: c.setId as string, startMs: c.startMs ?? null, endMs: c.endMs ?? null }))

  if (workout.startedAtEpochMs == null || workout.finishedAtEpochMs == null) {
    return { matchedActivity: null, hrSource: 'none', timeline: null, corrections, clockOffsetMs }
  }
  const start = workout.startedAtEpochMs
  const end = workout.finishedAtEpochMs

  let matchedActivity: ActivityRow | null = null
  let hrSamples: HrSample[] = []
  let hrSource: HrSource = 'none'

  if (loadedKinds.includes('activities')) {
    const nearby = await getActivitiesRange(addDays(workout.day, -1), addDays(workout.day, 1))
    matchedActivity = matchGarminActivity({ startedAtEpochMs: start + clockOffsetMs, finishedAtEpochMs: end + clockOffsetMs }, nearby)
    if (matchedActivity) {
      const records = await getActivityRecords(matchedActivity.activity_id)
      hrSamples = toSamples(records.map((r) => ({ timestamp: r.timestamp, v: r.hr })))
      if (hrSamples.length > 0) hrSource = 'activity'
    }
  }
  if (hrSource === 'none' && loadedKinds.includes('monitoring')) {
    const rows = await getMonitoringHrForDay(localDay(start + clockOffsetMs))
    hrSamples = toSamples(rows.map((r) => ({ timestamp: r.timestamp, v: r.heart_rate })))
    if (hrSamples.length > 0) hrSource = 'monitoring'
  }

  const timeline = buildWorkoutTimeline({ startedAtEpochMs: start, finishedAtEpochMs: end, sets: workout.sets, hrSamples, corrections, clockOffsetMs })
  return { matchedActivity, hrSource, timeline, corrections, clockOffsetMs }
}
