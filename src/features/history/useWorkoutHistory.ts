import { useEffect, useState } from 'react'
import { bandStoreEvents, indexedDbBandStore, type BandFileRecord, type HistoryEntry } from '../../lib/band/bandFileStore'
import { bandIndex, bandIndexEvents, type BandFileState } from '../../lib/band/bandIndex'
import { getAllWorkoutsWithSets, strengthLogEvents, type WorkoutWithSets } from '../../db/strengthLog'
import type { BandActivity } from '../../lib/band/fitImport'

/**
 * One list of every workout BetterGarmin knows about:
 *  - recorded on the band and downloaded (with its save status),
 *  - recorded on the band but not downloaded yet (from the last listing),
 *  - logged by hand or imported from Element 26.
 */

export interface SaveStatus {
  /** The file appeared in a listing from the band (or was downloaded from it, which implies it). */
  onBand: boolean
  downloaded: boolean
  inHistory: boolean
  lastError: string | null
}

export type HistoryItem =
  | { kind: 'band'; id: string; at: number | null; title: string; type: string; activity: BandActivity; record: BandFileRecord; entry: HistoryEntry | null; status: SaveStatus }
  | { kind: 'pending'; id: string; at: number | null; title: string; type: string; file: BandFileState; status: SaveStatus }
  | { kind: 'log'; id: string; at: number | null; title: string; type: string; workout: WorkoutWithSets }

/** FIT activity files list as FIT_TYPE_4. */
const isActivityType = (t: string | null) => t === 'FIT_TYPE_4'

export function sportLabel(a: Pick<BandActivity, 'sport' | 'subSport'>): string {
  const raw = a.subSport && a.subSport !== 'generic' ? a.subSport : a.sport
  if (!raw) return 'Workout'
  return raw.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()).trim()
}

export async function loadWorkoutHistory(): Promise<HistoryItem[]> {
  const [records, entries, workouts] = await Promise.all([indexedDbBandStore.all(), indexedDbBandStore.history(), getAllWorkoutsWithSets()])
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const index = bandIndex()
  const items: HistoryItem[] = []
  const downloaded = new Set<string>()
  for (const r of records) {
    downloaded.add(r.key)
    if (!r.activity) continue
    const entry = byKey.get(r.key) ?? null
    const at = r.activity.startTime ? Date.parse(r.activity.startTime) : r.modifiedTime
    items.push({
      kind: 'band',
      id: r.key,
      at,
      title: entry?.name || sportLabel(r.activity),
      type: sportLabel(r.activity),
      activity: r.activity,
      record: r,
      entry,
      status: { onBand: true, downloaded: true, inHistory: entry != null, lastError: null },
    })
  }
  for (const f of Object.values(index)) {
    if (downloaded.has(f.key) || !isActivityType(f.dataType)) continue
    items.push({
      kind: 'pending',
      id: f.key,
      at: f.modifiedTime,
      title: 'Workout on the band',
      type: 'Not downloaded yet',
      file: f,
      status: { onBand: true, downloaded: false, inHistory: false, lastError: f.lastError },
    })
  }
  for (const w of workouts) {
    items.push({
      kind: 'log',
      id: w.id,
      at: w.startedAtEpochMs ?? Date.parse(`${w.day}T12:00:00`),
      title: w.title || (w.split === 'custom' ? 'Strength workout' : `${w.split.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())} workout`),
      type: w.source === 'element26' ? 'Strength · Element 26' : 'Strength · logged',
      workout: w,
    })
  }
  return items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
}

export function useWorkoutHistory(): { items: HistoryItem[] | null; reload: () => void } {
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    bandStoreEvents.addEventListener('change', bump)
    bandIndexEvents.addEventListener('change', bump)
    strengthLogEvents.addEventListener('change', bump)
    return () => {
      bandStoreEvents.removeEventListener('change', bump)
      bandIndexEvents.removeEventListener('change', bump)
      strengthLogEvents.removeEventListener('change', bump)
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    loadWorkoutHistory()
      .then((i) => !cancelled && setItems(i))
      .catch(() => !cancelled && setItems([]))
    return () => {
      cancelled = true
    }
  }, [tick])
  return { items, reload: () => setTick((t) => t + 1) }
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m} min`
}
