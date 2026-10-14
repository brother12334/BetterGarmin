import { useCallback, useEffect, useState } from 'react'
import {
  deleteWorkout,
  getAllWorkoutsWithSets,
  saveWorkout,
  clearAllWorkouts,
  type SetRecord,
  type WorkoutRecord,
  type WorkoutWithSets,
} from '../../db/strengthLog'

export function useStrengthLog() {
  const [workouts, setWorkouts] = useState<WorkoutWithSets[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const all = await getAllWorkoutsWithSets()
    setWorkouts(all)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      await refresh()
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const save = useCallback(
    async (workout: WorkoutRecord, sets: SetRecord[]) => {
      await saveWorkout(workout, sets)
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (workoutId: string) => {
      await deleteWorkout(workoutId)
      await refresh()
    },
    [refresh],
  )

  const clearAll = useCallback(async () => {
    await clearAllWorkouts()
    await refresh()
  }, [refresh])

  return { workouts, loading, refresh, save, remove, clearAll }
}
