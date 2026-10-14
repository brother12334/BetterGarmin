import { useEffect, useState } from 'react'
import { getDailySummaryRange, getRestingHrRange } from '../../db/queries'
import { addDays } from '../../lib/dateRange'
import { computeBaseline } from '../../scores/baselines'
import { computeReadiness, type ReadinessResult } from '../../scores/readiness'
import { useData } from '../../app/DataProvider'
import { useTrainingSeries } from '../../hooks/useTrainingSeries'

const BASELINE_WINDOW_DAYS = 60

export function useReadiness(day: string | null, sleepScore: number | null) {
  const { loadedKinds, lastSynced } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const { fitnessFatigueForm } = useTrainingSeries(BASELINE_WINDOW_DAYS)
  const [result, setResult] = useState<ReadinessResult | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!day || !hasGarmin) {
        if (!cancelled) setResult(null)
        return
      }
      const startDay = addDays(day, -BASELINE_WINDOW_DAYS)
      const [rhrRows, summaryRows] = await Promise.all([
        getRestingHrRange(startDay, day),
        getDailySummaryRange(startDay, day),
      ])
      if (cancelled) return

      const rhrValues = rhrRows.map((r) => r.resting_heart_rate).filter((v): v is number => v != null)
      const restingHrBaseline = computeBaseline(rhrValues)
      const todayRhr = rhrRows.find((r) => r.day === day)?.resting_heart_rate ?? null

      const stressValues = summaryRows.map((r) => r.stress_avg).filter((v): v is number => v != null)
      const stressBaseline = computeBaseline(stressValues)
      const todayStress = summaryRows.find((r) => r.day === day)?.stress_avg ?? null

      const formValues = fitnessFatigueForm.map((f) => f.form)
      const formBaseline = computeBaseline(formValues)
      const todayForm = fitnessFatigueForm.length > 0 ? fitnessFatigueForm[fitnessFatigueForm.length - 1].form : null

      setResult(
        computeReadiness({
          sleepScore,
          restingHr: todayRhr,
          restingHrBaseline,
          form: todayForm,
          formBaseline,
          stressAvg: todayStress,
          stressBaseline,
        }),
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [day, hasGarmin, sleepScore, lastSynced, fitnessFatigueForm])

  return result
}
