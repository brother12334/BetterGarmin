import { useEffect, useState } from 'react'
import { useData } from '../../app/DataProvider'
import { getActivitiesRange, getLatestActivityDay } from '../../db/queries'
import type { ActivityRow } from '../../db/types'
import type { WorkoutWithSets } from '../../db/strengthLog'
import { addDays } from '../../lib/dateRange'
import { matchGarminActivity } from './matchGarminActivity'

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

  // Workouts with real timestamps (Element 26 imports) get matched live, not via a stored link,
  // so matching stays correct as new Garmin data comes in. Manually logged ones still use the
  // explicit linkedActivityId set via "Add sets for this session".
  const matchedByWorkout = new Map(
    workouts
      .filter((w) => w.startedAtEpochMs != null && w.finishedAtEpochMs != null)
      .map((w) => {
        const offset = w.clockOffsetMs ?? 0
        return [w.id, matchGarminActivity({ startedAtEpochMs: w.startedAtEpochMs! + offset, finishedAtEpochMs: w.finishedAtEpochMs! + offset }, garminSessions)]
      }),
  )
  const claimedActivityIds = new Set<string>()
  for (const w of workouts) {
    if (w.linkedActivityId) claimedActivityIds.add(w.linkedActivityId)
    const matched = matchedByWorkout.get(w.id)
    if (matched) claimedActivityIds.add(matched.activity_id)
  }
  const unlinkedActivities = garminSessions.filter((a) => !claimedActivityIds.has(a.activity_id))

  const activityById = new Map(garminSessions.map((a) => [a.activity_id, a]))
  const sessions: StrengthSession[] = [
    ...workouts.map((w) => {
      const activity = w.linkedActivityId ? (activityById.get(w.linkedActivityId) ?? null) : (matchedByWorkout.get(w.id) ?? null)
      return { day: w.day, workout: w, activity }
    }),
    ...unlinkedActivities.map((a) => ({ day: a.start_time?.slice(0, 10) ?? '', workout: null, activity: a })),
  ].sort((a, b) => (a.day < b.day ? 1 : -1))

  return { sessions, garminSessions, loading }
}
