import { useCallback, useEffect, useState } from 'react'
import { getLatestHeartRate } from '../../db/queries'
import { useData } from '../../app/DataProvider'

export function useLatestHeartRate() {
  const { loadedKinds, lastSynced, cloudConfigured, syncNow } = useData()
  const hasMonitoring = loadedKinds.includes('monitoring')
  const [reading, setReading] = useState<{ timestamp: string; heart_rate: number } | null>(null)
  const [loading, setLoading] = useState(false)
  // Bumped every 20s purely to force consumers to re-render and recompute
  // "X ago" — the reading itself doesn't change until a real sync happens.
  const [clock, setClock] = useState(0)

  // Re-query whenever newly-loaded files arrive or a background cloud sync completes.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!hasMonitoring) {
        if (!cancelled) setReading(null)
        return
      }
      const result = await getLatestHeartRate()
      if (!cancelled) setReading(result)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasMonitoring, lastSynced])

  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 20_000)
    return () => clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (cloudConfigured) await syncNow()
      setReading(hasMonitoring ? await getLatestHeartRate() : null)
    } finally {
      setLoading(false)
    }
  }, [cloudConfigured, syncNow, hasMonitoring])

  return { reading, loading, refresh, hasMonitoring, clock }
}
