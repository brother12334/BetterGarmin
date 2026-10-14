import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { sqliteClient } from '../db/client'
import { cacheDbFile, clearCachedFiles, getCachedFiles } from '../db/cache'
import { DB_KIND_INFO, type DbKind } from '../db/types'

type DataStatus = 'restoring' | 'empty' | 'ready'
type DataSource = 'user' | 'demo' | null

interface LoadFilesResult {
  loaded: { kind: DbKind; fileName: string }[]
  unrecognized: string[]
}

interface DataContextValue {
  status: DataStatus
  source: DataSource
  loadedKinds: DbKind[]
  loadFiles: (files: File[]) => Promise<LoadFilesResult>
  loadDemo: () => Promise<void>
  forgetData: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)
const SOURCE_KEY = 'bettergarmin:dataSource'

const DEMO_FILES: { fileName: string; kind: DbKind }[] = [
  { fileName: 'garmin.db', kind: 'garmin' },
  { fileName: 'garmin_monitoring.db', kind: 'monitoring' },
  { fileName: 'garmin_activities.db', kind: 'activities' },
  { fileName: 'garmin_summary.db', kind: 'summary' },
]

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DataStatus>('restoring')
  const [source, setSource] = useState<DataSource>(null)
  const [loadedKinds, setLoadedKinds] = useState<DbKind[]>([])

  useEffect(() => {
    let cancelled = false
    async function restore() {
      const cached = await getCachedFiles()
      if (cancelled) return
      if (cached.length > 0) {
        for (const file of cached) {
          await sqliteClient.loadKnown(file.kind, file.buffer)
        }
        if (cancelled) return
        setLoadedKinds(cached.map((f) => f.kind))
        setSource('user')
        setStatus('ready')
        return
      }

      const storedSource = (() => {
        try {
          return localStorage.getItem(SOURCE_KEY)
        } catch {
          return null
        }
      })()
      if (storedSource === 'demo') {
        await loadDemoInternal()
        if (!cancelled) setStatus('ready')
        return
      }
      setStatus('empty')
    }
    restore()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadDemoInternal() {
    const kinds: DbKind[] = []
    for (const demo of DEMO_FILES) {
      const res = await fetch(`${import.meta.env.BASE_URL}demo-data/${demo.fileName}`)
      if (!res.ok) continue
      const buffer = await res.arrayBuffer()
      await sqliteClient.loadKnown(demo.kind, buffer)
      kinds.push(demo.kind)
    }
    setLoadedKinds(kinds)
    setSource('demo')
    try {
      localStorage.setItem(SOURCE_KEY, 'demo')
    } catch {
      // non-critical convenience flag
    }
  }

  const loadFiles = useCallback(async (files: File[]): Promise<LoadFilesResult> => {
    const loaded: { kind: DbKind; fileName: string }[] = []
    const unrecognized: string[] = []
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const { kind } = await sqliteClient.loadFile(file.name, buffer)
      if (kind) {
        loaded.push({ kind, fileName: file.name })
        await cacheDbFile(kind, file.name, buffer)
      } else {
        unrecognized.push(file.name)
      }
    }
    if (loaded.length > 0) {
      setLoadedKinds((prev) => Array.from(new Set([...prev, ...loaded.map((l) => l.kind)])))
      setSource('user')
      setStatus('ready')
      try {
        localStorage.removeItem(SOURCE_KEY)
      } catch {
        // non-critical
      }
    }
    return { loaded, unrecognized }
  }, [])

  const loadDemo = useCallback(async () => {
    await loadDemoInternal()
    setStatus('ready')
  }, [])

  const forgetData = useCallback(async () => {
    await sqliteClient.clear()
    await clearCachedFiles()
    try {
      localStorage.removeItem(SOURCE_KEY)
    } catch {
      // non-critical
    }
    setLoadedKinds([])
    setSource(null)
    setStatus('empty')
  }, [])

  const value = useMemo(
    () => ({ status, source, loadedKinds, loadFiles, loadDemo, forgetData }),
    [status, source, loadedKinds, loadFiles, loadDemo, forgetData],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}

export function describeKind(kind: DbKind): string {
  return DB_KIND_INFO[kind].label
}
