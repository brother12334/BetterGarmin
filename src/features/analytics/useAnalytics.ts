import { useEffect, useState } from 'react'
import { useData } from '../../app/DataProvider'
import { strengthLogEvents, strengthLogVersion } from '../../db/strengthLog'
import { loadAnalyticsDataset, type AnalyticsDataset } from './dataset'
import { computeFindings, type Finding } from './findings'
import { computeRecovery, type RecoverySummary } from './recovery'

export interface AnalyticsResult {
  dataset: AnalyticsDataset
  recovery: RecoverySummary
  findings: Finding[]
}

// One in-flight/finished computation per data version, shared by every screen that asks for it.
let cache: { key: string; promise: Promise<AnalyticsResult> } | null = null

function compute(key: string, kinds: Parameters<typeof loadAnalyticsDataset>[0]): Promise<AnalyticsResult> {
  if (cache?.key === key) return cache.promise
  const promise = loadAnalyticsDataset(kinds).then((dataset) => {
    const recovery = computeRecovery(dataset)
    return { dataset, recovery, findings: computeFindings(dataset, recovery) }
  })
  cache = { key, promise }
  promise.catch(() => {
    if (cache?.promise === promise) cache = null
  })
  return promise
}

export function useAnalytics() {
  const { loadedKinds, lastSynced } = useData()
  const [version, setVersion] = useState(strengthLogVersion())
  const [result, setResult] = useState<AnalyticsResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onChange = () => setVersion(strengthLogVersion())
    strengthLogEvents.addEventListener('change', onChange)
    return () => strengthLogEvents.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    let cancelled = false
    const key = `${loadedKinds.join(',')}|${lastSynced?.getTime() ?? ''}|${version}`
    compute(key, loadedKinds)
      .then((r) => {
        if (!cancelled) {
          setResult(r)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Analysis failed')
      })
    return () => {
      cancelled = true
    }
  }, [loadedKinds, lastSynced, version])

  return { result, loading: result == null && error == null, error }
}
