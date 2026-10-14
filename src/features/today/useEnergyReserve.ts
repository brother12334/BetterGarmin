import { useEffect, useState } from 'react'
import { getStressForDay } from '../../db/queries'
import { computeEnergyReserveCurve, findBiggestSegments, type EnergyPoint, type EnergySegment } from '../../scores/energyReserve'
import { useData } from '../../app/DataProvider'

export function useEnergyReserve(day: string | null, startValue = 55) {
  const { loadedKinds, lastSynced } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const [curve, setCurve] = useState<EnergyPoint[]>([])
  const [segments, setSegments] = useState<{ biggestDrain: EnergySegment | null; bestRecharge: EnergySegment | null }>({
    biggestDrain: null,
    bestRecharge: null,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!day || !hasGarmin) {
        if (!cancelled) {
          setCurve([])
          setSegments({ biggestDrain: null, bestRecharge: null })
        }
        return
      }
      const samples = await getStressForDay(day)
      if (cancelled) return
      const nextCurve = computeEnergyReserveCurve(samples, startValue)
      setCurve(nextCurve)
      setSegments(findBiggestSegments(nextCurve))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [day, hasGarmin, lastSynced, startValue])

  return { curve, ...segments }
}
