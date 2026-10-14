import { useEffect, useState } from 'react'
import { useData } from '../../app/DataProvider'
import { getWorkoutWithSets, type WorkoutWithSets } from '../../db/strengthLog'
import {
  getActivitiesRange,
  getActivityRecords,
  getDailySummary,
  getHrv,
  getMonitoringRrForDay,
  getRestingHrRange,
  getSleep,
  getStressForDay,
} from '../../db/queries'
import type { ActivityRow } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { hmsToMinutes } from '../../lib/duration'
import { matchGarminActivity } from './matchGarminActivity'
import { buildWorkoutTimeline, type WorkoutTimeline } from './workoutTimeline'

export interface ReadinessContext {
  sleepScore: number | null
  sleepTotalMinutes: number | null
  restingHr: number | null
  hrvStatus: string | null
  hrvLastNightAvg: number | null
  bodyBatteryMin: number | null
  bodyBatteryMax: number | null
}

interface WorkoutTimelineState {
  loading: boolean
  workout: WorkoutWithSets | null
  matchedActivity: ActivityRow | null
  timeline: WorkoutTimeline | null
  readiness: ReadinessContext | null
}

export function useWorkoutTimeline(workoutId: string | undefined) {
  const { loadedKinds, lastSynced } = useData()
  const [state, setState] = useState<WorkoutTimelineState>({
    loading: true,
    workout: null,
    matchedActivity: null,
    timeline: null,
    readiness: null,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!workoutId) {
        if (!cancelled) setState((s) => ({ ...s, loading: false }))
        return
      }
      setState((s) => ({ ...s, loading: true }))
      const workout = await getWorkoutWithSets(workoutId)
      if (!workout) {
        if (!cancelled) setState({ loading: false, workout: null, matchedActivity: null, timeline: null, readiness: null })
        return
      }

      let matchedActivity: ActivityRow | null = null
      let timeline: WorkoutTimeline | null = null
      let readiness: ReadinessContext | null = null

      if (loadedKinds.includes('activities') && workout.startedAtEpochMs != null) {
        const nearby = await getActivitiesRange(addDays(workout.day, -1), addDays(workout.day, 1))
        matchedActivity = matchGarminActivity(workout, nearby)
      }

      if (matchedActivity && workout.startedAtEpochMs != null && workout.finishedAtEpochMs != null) {
        const records = await getActivityRecords(matchedActivity.activity_id)
        const [stressSamples, respirationSamples] = await Promise.all([
          loadedKinds.includes('garmin') ? getStressForDay(workout.day) : Promise.resolve([]),
          loadedKinds.includes('monitoring') ? getMonitoringRrForDay(workout.day) : Promise.resolve([]),
        ])
        timeline = buildWorkoutTimeline({ workout, sets: workout.sets, activityRecords: records, stressSamples, respirationSamples })
      }

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

      if (!cancelled) setState({ loading: false, workout, matchedActivity, timeline, readiness })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [workoutId, loadedKinds, lastSynced])

  return state
}
