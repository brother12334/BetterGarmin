import { useEffect, useState } from 'react'
import { getDailySummaryRange, getLatestDay, getRestingHrRange, getSleepRange, getWeightRange } from '../../db/queries'
import { addDays, enumerateDays } from '../../lib/dateRange'
import { hmsToMinutes } from '../../lib/duration'
import { useData } from '../../app/DataProvider'

export interface DailyMetrics {
  day: string
  steps: number | null
  restingHr: number | null
  stressAvg: number | null
  sleepScore: number | null
  sleepMinutes: number | null
  weight: number | null
  calories: number | null
  distance: number | null
}

export const METRIC_OPTIONS: { key: keyof Omit<DailyMetrics, 'day'>; label: string; unit: string }[] = [
  { key: 'steps', label: 'Steps', unit: '' },
  { key: 'restingHr', label: 'Resting HR', unit: 'bpm' },
  { key: 'stressAvg', label: 'Stress', unit: '' },
  { key: 'sleepScore', label: 'Sleep score', unit: '' },
  { key: 'sleepMinutes', label: 'Sleep duration', unit: 'min' },
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'distance', label: 'Distance', unit: 'km' },
]

export function useInsightsData(windowDays = 180) {
  const { loadedKinds, lastSynced } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const [data, setData] = useState<DailyMetrics[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!hasGarmin) {
        if (!cancelled) {
          setData([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const latest = await getLatestDay()
      if (!latest) {
        if (!cancelled) {
          setData([])
          setLoading(false)
        }
        return
      }
      const startDay = addDays(latest, -windowDays)
      const [summary, resting, sleep, weight] = await Promise.all([
        getDailySummaryRange(startDay, latest),
        getRestingHrRange(startDay, latest),
        getSleepRange(startDay, latest),
        getWeightRange(startDay, latest),
      ])
      if (cancelled) return

      const summaryByDay = new Map(summary.map((s) => [s.day, s]))
      const restingByDay = new Map(resting.map((r) => [r.day, r.resting_heart_rate]))
      const sleepByDay = new Map(sleep.map((s) => [s.day, s]))
      const weightByDay = new Map(weight.map((w) => [w.day, w.weight]))

      const merged = enumerateDays(startDay, latest).map((day) => {
        const s = summaryByDay.get(day)
        const sl = sleepByDay.get(day)
        return {
          day,
          steps: s?.steps ?? null,
          restingHr: restingByDay.get(day) ?? s?.rhr ?? null,
          stressAvg: s?.stress_avg ?? null,
          sleepScore: sl?.score ?? null,
          sleepMinutes: sl ? hmsToMinutes(sl.total_sleep) : null,
          weight: weightByDay.get(day) ?? null,
          calories: s?.calories_total ?? null,
          distance: s?.distance ?? null,
        }
      })
      setData(merged)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasGarmin, windowDays, lastSynced])

  return { data, loading }
}
