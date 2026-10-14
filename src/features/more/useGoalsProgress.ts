import { useEffect, useState } from 'react'
import { useData } from '../../app/DataProvider'
import { getActivitiesRange, getDailySummary, getLatestDay, getSleep } from '../../db/queries'
import { addDays } from '../../lib/dateRange'
import { hmsToMinutes } from '../../lib/duration'

const ACTIVE_WINDOW_DAYS = 7

export interface GoalsProgress {
  steps: number | null
  sleepMinutes: number | null
  activeDays: number | null
}

export function useGoalsProgress(): GoalsProgress {
  const { loadedKinds, lastSynced } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const hasActivities = loadedKinds.includes('activities')
  const [progress, setProgress] = useState<GoalsProgress>({ steps: null, sleepMinutes: null, activeDays: null })

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
      const [summary, sleep, activities] = await Promise.all([
        getDailySummary(day),
        getSleep(day),
        hasActivities ? getActivitiesRange(addDays(day, -ACTIVE_WINDOW_DAYS + 1), day) : Promise.resolve([]),
      ])
      if (cancelled) return

      const activeDaySet = new Set(
        activities
          .filter((a) => a.start_time)
          .map((a) => (a.start_time as string).slice(0, 10)),
      )

      setProgress({
        steps: summary?.steps ?? null,
        sleepMinutes: sleep ? hmsToMinutes(sleep.total_sleep) : null,
        activeDays: hasActivities ? activeDaySet.size : null,
      })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasGarmin, hasActivities, lastSynced])

  return progress
}
