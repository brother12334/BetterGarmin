import { useEffect, useState } from 'react'
import { getDailyTrainingLoad, getLatestActivityDay } from '../db/queries'
import { enumerateDays, addDays } from '../lib/dateRange'
import { computeTrainingLoad, type TrainingLoadPoint } from '../scores/trainingLoad'
import { computeFitnessFatigueForm, type FitnessFatiguePoint } from '../scores/fitnessFatigueForm'
import { useData } from '../app/DataProvider'

export interface TrainingSeries {
  loading: boolean
  latestDay: string | null
  trainingLoad: TrainingLoadPoint[]
  fitnessFatigueForm: FitnessFatiguePoint[]
}

/** Daily training load, ACWR/status, and Banister Fitness/Fatigue/Form over a trailing window. */
export function useTrainingSeries(windowDays = 90): TrainingSeries {
  const { loadedKinds, lastSynced } = useData()
  const hasActivities = loadedKinds.includes('activities')
  const [series, setSeries] = useState<Omit<TrainingSeries, 'loading'>>({
    latestDay: null,
    trainingLoad: [],
    fitnessFatigueForm: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!hasActivities) {
        if (!cancelled) {
          setSeries({ latestDay: null, trainingLoad: [], fitnessFatigueForm: [] })
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const latestDay = await getLatestActivityDay()
      if (!latestDay) {
        if (!cancelled) {
          setSeries({ latestDay: null, trainingLoad: [], fitnessFatigueForm: [] })
          setLoading(false)
        }
        return
      }
      const startDay = addDays(latestDay, -windowDays)
      const raw = await getDailyTrainingLoad(startDay, latestDay)
      const loadByDay = new Map(raw.map((r) => [r.day, r.load ?? 0]))
      const daily = enumerateDays(startDay, latestDay).map((day) => ({ day, load: loadByDay.get(day) ?? 0 }))
      const trainingLoad = computeTrainingLoad(daily)
      const fitnessFatigueForm = computeFitnessFatigueForm(daily)
      if (!cancelled) {
        setSeries({ latestDay, trainingLoad, fitnessFatigueForm })
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasActivities, lastSynced, windowDays])

  return { ...series, loading }
}
