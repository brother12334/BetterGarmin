import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { sqliteClient } from '../db/client'
import { cacheDbFile, clearCachedFiles, getCachedFiles } from '../db/cache'
import { DB_KIND_INFO, type DbKind } from '../db/types'
import { fetchManifest, fetchCloudFile, testCloudConfig, type CloudConfig, startCloudSync } from '../db/cloudSync'
import { deleteWorkout, getAllWorkoutsWithSets, hasAnyWorkouts, seedDemoWorkouts, type SetRecord, type WorkoutRecord } from '../db/strengthLog'

type DataStatus = 'restoring' | 'empty' | 'ready'
type DataSource = 'user' | 'demo' | 'cloud' | null
type CloudSyncStatus = 'idle' | 'syncing' | 'error'

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
  // Cloud sync
  cloudConfigured: boolean
  cloudStatus: CloudSyncStatus
  cloudError: string | null
  lastSynced: Date | null
  connectCloud: (config: CloudConfig) => Promise<{ ok: boolean; error?: string }>
  disconnectCloud: () => void
  syncNow: () => Promise<void>
  /** Runs the Garmin download now (not just a re-check of storage), then loads the result. */
  pullFromGarmin: () => Promise<void>
  garminPull: GarminPullState
  /** Whether the device currently has a connection. */
  online: boolean
}

export type GarminPullState = { status: 'idle' } | { status: 'running'; startedAt: Date } | { status: 'error'; message: string }

const DataContext = createContext<DataContextValue | null>(null)
const SOURCE_KEY = 'bettergarmin:dataSource'
const CLOUD_CONFIG_KEY = 'bettergarmin:cloudConfig'
const CLOUD_MANIFEST_KEY = 'bettergarmin:cloudManifest'
const CLOUD_POLL_INTERVAL_MS = 5 * 60 * 1000
const LAST_SYNCED_KEY = 'bettergarmin:lastSynced'
const PULL_POLL_MS = 5000
const PULL_TIMEOUT_MS = 6 * 60 * 1000

const DEMO_FILES: { fileName: string; kind: DbKind }[] = [
  { fileName: 'garmin.db', kind: 'garmin' },
  { fileName: 'garmin_monitoring.db', kind: 'monitoring' },
  { fileName: 'garmin_activities.db', kind: 'activities' },
  { fileName: 'garmin_summary.db', kind: 'summary' },
]

function readCloudConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.workerUrl === 'string' && typeof parsed?.token === 'string') return parsed
    return null
  } catch {
    return null
  }
}

function readSyncedManifest(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CLOUD_MANIFEST_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeSyncedManifest(manifest: Record<string, string>) {
  try {
    localStorage.setItem(CLOUD_MANIFEST_KEY, JSON.stringify(manifest))
  } catch {
    // non-critical convenience cache
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DataStatus>('restoring')
  const [source, setSource] = useState<DataSource>(null)
  const [loadedKinds, setLoadedKinds] = useState<DbKind[]>([])
  const [cloudConfigured, setCloudConfigured] = useState(() => readCloudConfig() != null)
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>('idle')
  const [cloudError, setCloudError] = useState<string | null>(null)
  // Remembered across launches so an offline start can still say how fresh the saved data is.
  const [lastSynced, setLastSynced] = useState<Date | null>(() => {
    try {
      const v = localStorage.getItem(LAST_SYNCED_KEY)
      return v ? new Date(v) : null
    } catch {
      return null
    }
  })
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  const cloudConfigRef = useRef<CloudConfig | null>(null)

  const syncFromCloud = useCallback(async (config: CloudConfig, opts: { force?: boolean } = {}) => {
    // Offline, the saved copy is all there is: keep showing it instead of reporting an error.
    if (!navigator.onLine) {
      setCloudStatus('idle')
      return
    }
    setCloudStatus('syncing')
    setCloudError(null)
    try {
      const files = await fetchManifest(config)
      const known = readSyncedManifest()
      const updated: Record<string, string> = { ...known }
      const newlyLoaded: DbKind[] = []

      for (const file of files) {
        const unchanged = !opts.force && known[file.name] === file.lastModified
        if (unchanged) continue
        const buffer = await fetchCloudFile(config, file.name)
        const { kind } = await sqliteClient.loadFile(file.name, buffer)
        if (kind) {
          await cacheDbFile(kind, file.name, buffer)
          newlyLoaded.push(kind)
          updated[file.name] = file.lastModified
        }
      }

      writeSyncedManifest(updated)
      if (newlyLoaded.length > 0) {
        setLoadedKinds((prev) => Array.from(new Set([...prev, ...newlyLoaded])))
      }
      const now = new Date()
      setLastSynced(now)
      try {
        localStorage.setItem(LAST_SYNCED_KEY, now.toISOString())
      } catch {
        // fine to lose
      }
      setCloudStatus('idle')
    } catch (err) {
      setCloudStatus('error')
      setCloudError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function restore() {
      // A dedicated "?demo=1" link (e.g. a second home-screen icon) always jumps
      // straight into demo mode, skipping onboarding and any other data source.
      const forceDemo = new URLSearchParams(window.location.search).get('demo') === '1'
      if (forceDemo) {
        await loadDemoInternal()
        if (!cancelled) setStatus('ready')
        return
      }

      const cloudConfig = readCloudConfig()
      const cached = await getCachedFiles()

      if (cached.length > 0) {
        for (const file of cached) {
          await sqliteClient.loadKnown(file.kind, file.buffer)
        }
        if (cancelled) return
        setLoadedKinds(cached.map((f) => f.kind))
        setSource(cloudConfig ? 'cloud' : 'user')
        setStatus('ready')
        if (cloudConfig) {
          cloudConfigRef.current = cloudConfig
          syncFromCloud(cloudConfig)
        }
        return
      }

      if (cloudConfig) {
        cloudConfigRef.current = cloudConfig
        setSource('cloud')
        await syncFromCloud(cloudConfig)
        if (cancelled) return
        setStatus('ready') // "ready" even with zero files yet — the Cloud sync card explains/retries
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

  // The demo seeds sample strength workouts. Once real data is in use, remove any of them still in the log
  // (matched by the seed's workout ids) so they never mix into the user's own analysis.
  useEffect(() => {
    if (source == null || source === 'demo') return
    ;(async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}demo-data/strength-log.json`)
        if (!res.ok) return
        const data = (await res.json()) as { workouts: WorkoutRecord[] }
        const demoIds = new Set(data.workouts.map((w) => w.id))
        for (const workout of await getAllWorkoutsWithSets()) {
          if (demoIds.has(workout.id)) await deleteWorkout(workout.id)
        }
      } catch {
        // best effort; retried on the next launch
      }
    })()
  }, [source])

  // Poll for fresh cloud data while connected: every few minutes, and whenever the tab regains focus.
  useEffect(() => {
    if (source !== 'cloud') return
    const tick = () => {
      if (cloudConfigRef.current) syncFromCloud(cloudConfigRef.current)
    }
    const interval = setInterval(tick, CLOUD_POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Back online: catch up straight away.
    window.addEventListener('online', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', tick)
    }
  }, [source, syncFromCloud])

  /** `reseed`: replace the strength log with the demo seed. Restoring an existing demo session keeps what's there (imports, corrections). */
  async function loadDemoInternal(reseed = false) {
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

    try {
      if (!reseed && (await hasAnyWorkouts())) return
      const res = await fetch(`${import.meta.env.BASE_URL}demo-data/strength-log.json`)
      if (res.ok) {
        const data: { workouts: WorkoutRecord[]; sets: SetRecord[] } = await res.json()
        await seedDemoWorkouts(data.workouts, data.sets)
      }
    } catch {
      // the Strength page just renders empty if this fails — not worth blocking demo mode over
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
    await loadDemoInternal(true)
    setStatus('ready')
  }, [])

  const forgetData = useCallback(async () => {
    await sqliteClient.clear()
    await clearCachedFiles()
    try {
      localStorage.removeItem(SOURCE_KEY)
      localStorage.removeItem(CLOUD_CONFIG_KEY)
      localStorage.removeItem(CLOUD_MANIFEST_KEY)
    } catch {
      // non-critical
    }
    cloudConfigRef.current = null
    setCloudConfigured(false)
    setLoadedKinds([])
    setSource(null)
    setStatus('empty')
  }, [])

  const connectCloud = useCallback(async (config: CloudConfig): Promise<{ ok: boolean; error?: string }> => {
    const test = await testCloudConfig(config)
    if (!test.ok) return { ok: false, error: test.error }
    try {
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config))
      localStorage.removeItem(SOURCE_KEY)
      localStorage.removeItem(CLOUD_MANIFEST_KEY) // force a full download on first connect
    } catch {
      // non-critical
    }
    cloudConfigRef.current = config
    setCloudConfigured(true)
    setSource('cloud')
    await syncFromCloud(config, { force: true })
    setStatus('ready')
    return { ok: true }
  }, [syncFromCloud])

  const disconnectCloud = useCallback(() => {
    try {
      localStorage.removeItem(CLOUD_CONFIG_KEY)
      localStorage.removeItem(CLOUD_MANIFEST_KEY)
    } catch {
      // non-critical
    }
    cloudConfigRef.current = null
    setCloudConfigured(false)
    setCloudStatus('idle')
    setCloudError(null)
    setSource((prev) => (prev === 'cloud' ? 'user' : prev))
  }, [])

  const [garminPull, setGarminPull] = useState<GarminPullState>({ status: 'idle' })

  const pullFromGarmin = useCallback(async () => {
    const config = cloudConfigRef.current
    if (!config) return
    if (!navigator.onLine) {
      setGarminPull({ status: 'error', message: "You're offline. Showing the data saved on this device." })
      return
    }
    try {
      const startedAt = await startCloudSync(config)
      setGarminPull({ status: 'running', startedAt })
      // The job takes about a minute and a half; watch storage closely until it has uploaded something newer.
      const deadline = Date.now() + PULL_TIMEOUT_MS
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, PULL_POLL_MS))
        if (cloudConfigRef.current !== config) return
        const files = await fetchManifest(config)
        if (files.some((f) => new Date(f.lastModified).getTime() > startedAt.getTime())) {
          await syncFromCloud(config)
          setGarminPull({ status: 'idle' })
          return
        }
      }
      setGarminPull({ status: 'error', message: "The sync is taking longer than usual. It will show up automatically when it's done." })
    } catch (err) {
      setGarminPull({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [syncFromCloud])

  const syncNow = useCallback(async () => {
    if (cloudConfigRef.current) await syncFromCloud(cloudConfigRef.current, { force: true })
  }, [syncFromCloud])

  const value = useMemo(
    () => ({
      status,
      source,
      loadedKinds,
      loadFiles,
      loadDemo,
      forgetData,
      cloudConfigured,
      cloudStatus,
      cloudError,
      lastSynced,
      connectCloud,
      disconnectCloud,
      syncNow,
      pullFromGarmin,
      garminPull,
      online,
    }),
    [
      status,
      source,
      loadedKinds,
      loadFiles,
      loadDemo,
      forgetData,
      cloudConfigured,
      cloudStatus,
      cloudError,
      lastSynced,
      connectCloud,
      disconnectCloud,
      syncNow,
      pullFromGarmin,
      garminPull,
      online,
    ],
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
