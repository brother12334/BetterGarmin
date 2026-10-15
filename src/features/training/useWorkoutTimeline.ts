import { useCallback, useEffect, useState } from 'react'
import { useData } from '../../app/DataProvider'
import {
  getAllWorkoutsWithSets,
  getCorrections,
  getWorkoutWithSets,
  saveClockOffset,
  saveSetCorrection,
  type SetRecord,
  type WorkoutWithSets,
} from '../../db/strengthLog'
import {
  getActivitiesRange,
  getActivityRecords,
  getDailySummary,
  getHrv,
  getMonitoringHrForDay,
  getRestingHrRange,
  getSleep,
} from '../../db/queries'
import type { ActivityRow } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { hmsToMinutes } from '../../lib/duration'
import { matchGarminActivity, parseGarminTimestamp } from './matchGarminActivity'
import { buildWorkoutTimeline, type HrSample, type SetCorrection, type WorkoutTimeline } from './workoutTimeline'

export interface ReadinessContext {
  sleepScore: number | null
  sleepTotalMinutes: number | null
  restingHr: number | null
  hrvStatus: string | null
  hrvLastNightAvg: number | null
  bodyBatteryMin: number | null
  bodyBatteryMax: number | null
}

/** Where the HR trace came from. 'activity' = the watch's recorded strength activity (dense); 'monitoring' = all-day HR (coarse, ~1-2 min). */
export type HrSource = 'activity' | 'monitoring' | 'none'

export interface PreviousExerciseSession {
  workoutId: string
  day: string
  sets: SetRecord[]
}

interface State {
  loading: boolean
  workout: WorkoutWithSets | null
  matchedActivity: ActivityRow | null
  hrSource: HrSource
  timeline: WorkoutTimeline | null
  readiness: ReadinessContext | null
  corrections: SetCorrection[]
  clockOffsetMs: number
  previousByExercise: Map<string, PreviousExerciseSession>
}

const EMPTY: State = {
  loading: true,
  workout: null,
  matchedActivity: null,
  hrSource: 'none',
  timeline: null,
  readiness: null,
  corrections: [],
  clockOffsetMs: 0,
  previousByExercise: new Map(),
}

function toSamples(rows: { timestamp: string | null; v: number | null }[]): HrSample[] {
  const out: HrSample[] = []
  for (const r of rows) {
    const t = parseGarminTimestamp(r.timestamp)
    if (t != null && r.v != null) out.push({ t, v: r.v })
  }
  return out
}

export function useWorkoutTimeline(workoutId: string | undefined) {
  const { loadedKinds, lastSynced } = useData()
  const [state, setState] = useState<State>(EMPTY)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!workoutId) {
        if (!cancelled) setState({ ...EMPTY, loading: false })
        return
      }
      const workout = await getWorkoutWithSets(workoutId)
      if (!workout) {
        if (!cancelled) setState({ ...EMPTY, loading: false })
        return
      }

      const correctionRecords = await getCorrections(workoutId)
      const clockOffsetMs = correctionRecords.find((c) => c.id === `workout:${workoutId}`)?.clockOffsetMs ?? 0
      const corrections: SetCorrection[] = correctionRecords
        .filter((c) => c.setId)
        .map((c) => ({ setId: c.setId as string, startMs: c.startMs ?? null, endMs: c.endMs ?? null }))

      let matchedActivity: ActivityRow | null = null
      let hrSamples: HrSample[] = []
      let hrSource: HrSource = 'none'
      const timed = workout.startedAtEpochMs != null && workout.finishedAtEpochMs != null

      if (timed && loadedKinds.includes('activities')) {
        const nearby = await getActivitiesRange(addDays(workout.day, -1), addDays(workout.day, 1))
        matchedActivity = matchGarminActivity(
          { startedAtEpochMs: workout.startedAtEpochMs! + clockOffsetMs, finishedAtEpochMs: workout.finishedAtEpochMs! + clockOffsetMs },
          nearby,
        )
        if (matchedActivity) {
          const records = await getActivityRecords(matchedActivity.activity_id)
          hrSamples = toSamples(records.map((r) => ({ timestamp: r.timestamp, v: r.hr })))
          if (hrSamples.length > 0) hrSource = 'activity'
        }
      }
      if (timed && hrSource === 'none' && loadedKinds.includes('monitoring')) {
        const day = new Date(workout.startedAtEpochMs! + clockOffsetMs)
        const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
        const rows = await getMonitoringHrForDay(dayStr)
        hrSamples = toSamples(rows.map((r) => ({ timestamp: r.timestamp, v: r.heart_rate })))
        if (hrSamples.length > 0) hrSource = 'monitoring'
      }

      const timeline = timed
        ? buildWorkoutTimeline({
            startedAtEpochMs: workout.startedAtEpochMs!,
            finishedAtEpochMs: workout.finishedAtEpochMs!,
            sets: workout.sets,
            hrSamples,
            corrections,
            clockOffsetMs,
          })
        : null

      let readiness: ReadinessContext | null = null
      if (loadedKinds.includes('garmin')) {
        const [sleep, rhrRows, hrv, daily] = await Promise.all([
          getSleep(workout.day),
          getRestingHrRange(workout.day, workout.day),
          getHrv(workout.day),
          getDailySummary(workout.day),
        ])
        readiness = {
          sleepScore: sleep?.score ?? null,
          sleepTotalMinutes: sleep ? hmsToMinutes(sleep.total_sleep) : null,
          restingHr: rhrRows[0]?.resting_heart_rate ?? null,
          hrvStatus: hrv?.status ?? null,
          hrvLastNightAvg: hrv?.last_night_avg ?? null,
          bodyBatteryMin: daily?.bb_min ?? null,
          bodyBatteryMax: daily?.bb_max ?? null,
        }
      }

      const previousByExercise = new Map<string, PreviousExerciseSession>()
      const exercises = new Set(workout.sets.map((s) => s.exercise))
      const earlier = (await getAllWorkoutsWithSets()).filter(
        (w) => w.id !== workout.id && (w.day < workout.day || (w.day === workout.day && w.createdAt < workout.createdAt)),
      )
      for (const w of earlier) {
        for (const ex of exercises) {
          if (previousByExercise.has(ex)) continue
          const exSets = w.sets.filter((s) => s.exercise === ex)
          if (exSets.length > 0) previousByExercise.set(ex, { workoutId: w.id, day: w.day, sets: exSets })
        }
      }

      if (!cancelled) {
        setState({ loading: false, workout, matchedActivity, hrSource, timeline, readiness, corrections, clockOffsetMs, previousByExercise })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [workoutId, loadedKinds, lastSynced, version])

  const correctSet = useCallback(
    async (setId: string, startMs: number | null, endMs: number | null) => {
      if (!workoutId) return
      await saveSetCorrection(workoutId, setId, startMs, endMs)
      setVersion((v) => v + 1)
    },
    [workoutId],
  )

  const setClockOffset = useCallback(
    async (ms: number) => {
      if (!workoutId) return
      await saveClockOffset(workoutId, ms)
      setVersion((v) => v + 1)
    },
    [workoutId],
  )

  return { ...state, correctSet, setClockOffset }
}
