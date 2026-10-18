import { getCorrections, type WorkoutWithSets } from '../../db/strengthLog'
import { getActivitiesRange, getActivityRecords, getMonitoringHrForDay } from '../../db/queries'
import type { ActivityRow, DbKind } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { matchGarminActivity, parseGarminTimestamp, suggestClockOffset, type OffsetSuggestion } from './matchGarminActivity'
import { buildWorkoutTimeline, type HrSample, type SetCorrection, type WorkoutTimeline } from './workoutTimeline'

/** Where the HR trace came from. 'activity' = the watch's recorded activity (dense); 'monitoring' = all-day HR (coarse, ~1-2 min). */
export type HrSource = 'activity' | 'monitoring' | 'none'

export interface WorkoutAnalysis {
  matchedActivity: ActivityRow | null
  hrSource: HrSource
  timeline: WorkoutTimeline | null
  corrections: SetCorrection[]
  clockOffsetMs: number
  /** Set when the logged times overlap no strength activity but a time-zone-sized shift would line them up. */
  offsetSuggestion: OffsetSuggestion | null
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
    return { matchedActivity: null, hrSource: 'none', timeline: null, corrections, clockOffsetMs, offsetSuggestion: null }
  }
  const start = workout.startedAtEpochMs
  const end = workout.finishedAtEpochMs

  let matchedActivity: ActivityRow | null = null
  let hrSamples: HrSample[] = []
  let hrSource: HrSource = 'none'
  let offsetSuggestion: OffsetSuggestion | null = null

  if (loadedKinds.includes('activities')) {
    const nearby = await getActivitiesRange(addDays(workout.day, -1), addDays(workout.day, 1))
    const shifted = { startedAtEpochMs: start + clockOffsetMs, finishedAtEpochMs: end + clockOffsetMs }
    offsetSuggestion = suggestClockOffset(shifted, nearby)
    matchedActivity = matchGarminActivity(shifted, nearby)
    if (matchedActivity) {
      const records = await getActivityRecords(matchedActivity.activity_id)
      hrSamples = toSamples(records.map((r) => ({ timestamp: r.timestamp, v: r.hr })))
      if (hrSamples.length > 0) hrSource = 'activity'
    }
  }
  if (loadedKinds.includes('monitoring')) {
    const rows = await getMonitoringHrForDay(localDay(start + clockOffsetMs))
    const allDay = toSamples(rows.map((r) => ({ timestamp: r.timestamp, v: r.heart_rate })))
    if (hrSource === 'none') {
      hrSamples = allDay
      if (hrSamples.length > 0) hrSource = 'monitoring'
    } else if (hrSamples.length > 0) {
      // Sets done before the Garmin activity was started (or after it was stopped) only have all-day heart rate.
      // Fill in outside the recorded activity; inside it, the dense activity trace wins.
      const first = hrSamples[0].t
      const last = hrSamples[hrSamples.length - 1].t
      const outside = allDay.filter((s) => s.t < first || s.t > last)
      if (outside.length > 0) hrSamples = [...hrSamples, ...outside].sort((x, y) => x.t - y.t)
    }
  }

  const timeline = buildWorkoutTimeline({ startedAtEpochMs: start, finishedAtEpochMs: end, sets: workout.sets, hrSamples, corrections, clockOffsetMs })
  return { matchedActivity, hrSource, timeline, corrections, clockOffsetMs, offsetSuggestion }
}
