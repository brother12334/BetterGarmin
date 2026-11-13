import { useEffect, useState } from 'react'
import { useData } from '../../app/DataProvider'
import { getActivitiesRange, getDailySummary, getDailySummaryRange, getLatestDay, getSleep } from '../../db/queries'
import { getAllWorkoutsWithSets, strengthLogEvents } from '../../db/strengthLog'
import { addDays } from '../../lib/dateRange'
import { hmsToMinutes } from '../../lib/duration'

const ACTIVE_WINDOW_DAYS = 7
/** Intensity minutes (moderate + vigorous) that make a day count as active without a recorded workout. */
const ACTIVE_DAY_MINUTES = 20

export interface GoalsProgress {
  steps: number | null
  sleepMinutes: number | null
  activeDays: number | null
}

export function useGoalsProgress(): GoalsProgress {
  const { loadedKinds, lastSynced } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const hasActivities = loadedKinds.includes('activities')
  const [logVersion, setLogVersion] = useState(0)
  const [progress, setProgress] = useState<GoalsProgress>({ steps: null, sleepMinutes: null, activeDays: null })

  useEffect(() => {
    const bump = () => setLogVersion((v) => v + 1)
    strengthLogEvents.addEventListener('change', bump)
    return () => strengthLogEvents.removeEventListener('change', bump)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!hasGarmin) {
        if (!cancelled) setProgress({ steps: null, sleepMinutes: null, activeDays: null })
        return
      }
      const day = await getLatestDay()
      if (!day) {
        if (!cancelled) setProgress({ steps: null, sleepMinutes: null, activeDays: null })
        return
      }
      const weekStart = addDays(day, -ACTIVE_WINDOW_DAYS + 1)
      const [summary, sleep, activities, summaries, workouts] = await Promise.all([
        getDailySummary(day),
        getSleep(day),
        hasActivities ? getActivitiesRange(weekStart, day) : Promise.resolve([]),
        getDailySummaryRange(weekStart, day),
        getAllWorkoutsWithSets().catch(() => []),
      ])
      if (cancelled) return

      // A day is active if the band logged a workout, it counted enough
      // intensity minutes, or a gym session was logged in BetterGarmin.
      const activeDaySet = new Set<string>()
      for (const a of activities) if (a.start_time) activeDaySet.add(a.start_time.slice(0, 10))
      for (const s of summaries) {
        const minutes = (hmsToMinutes(s.moderate_activity_time) ?? 0) + (hmsToMinutes(s.vigorous_activity_time) ?? 0)
        if (minutes >= ACTIVE_DAY_MINUTES) activeDaySet.add(s.day.slice(0, 10))
      }
      for (const w of workouts) if (w.day >= weekStart && w.day <= day) activeDaySet.add(w.day)

      setProgress({
        steps: summary?.steps ?? null,
        sleepMinutes: sleep ? hmsToMinutes(sleep.total_sleep) : null,
        activeDays: activeDaySet.size,
      })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasGarmin, hasActivities, lastSynced, logVersion])

  return progress
}
