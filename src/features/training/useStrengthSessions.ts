import { useEffect, useState } from 'react'
import { useData } from '../../app/DataProvider'
import { getActivitiesRange, getLatestActivityDay } from '../../db/queries'
import type { ActivityRow } from '../../db/types'
import type { WorkoutWithSets } from '../../db/strengthLog'
import { addDays } from '../../lib/dateRange'

const WINDOW_DAYS = 365

export interface StrengthSession {
  day: string
  workout: WorkoutWithSets | null
  activity: ActivityRow | null
}

function isStrengthActivity(a: ActivityRow): boolean {
  return a.sub_sport === 'strength_training' || a.sport === 'strength_training'
}

/** Merges manually logged workouts with Garmin-detected strength sessions (matched by linked activity, else by day). */
export function useStrengthSessions(workouts: WorkoutWithSets[]) {
  const { loadedKinds, lastSynced } = useData()
  const hasActivities = loadedKinds.includes('activities')
  const [garminSessions, setGarminSessions] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!hasActivities) {
        if (!cancelled) {
          setGarminSessions([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const latest = await getLatestActivityDay()
      if (!latest) {
        if (!cancelled) {
          setGarminSessions([])
          setLoading(false)
        }
        return
      }
      const rows = await getActivitiesRange(addDays(latest, -WINDOW_DAYS), latest)
      if (!cancelled) {
        setGarminSessions(rows.filter(isStrengthActivity))
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasActivities, lastSynced])

  const linkedActivityIds = new Set(workouts.map((w) => w.linkedActivityId).filter((id): id is string => id != null))
  const unlinkedActivities = garminSessions.filter((a) => !linkedActivityIds.has(a.activity_id))

  const activityById = new Map(garminSessions.map((a) => [a.activity_id, a]))
  const sessions: StrengthSession[] = [
    ...workouts.map((w) => ({ day: w.day, workout: w, activity: w.linkedActivityId ? (activityById.get(w.linkedActivityId) ?? null) : null })),
    ...unlinkedActivities.map((a) => ({ day: a.start_time?.slice(0, 10) ?? '', workout: null, activity: a })),
  ].sort((a, b) => (a.day < b.day ? 1 : -1))

  return { sessions, garminSessions, loading }
}
