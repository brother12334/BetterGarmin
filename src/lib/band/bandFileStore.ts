import { openDB, type IDBPDatabase } from 'idb'
import type { BandActivity } from './fitImport'

/** One file synced from the band. Saved before a sync counts it as done; the key prevents duplicate imports. */
export interface BandFileRecord {
  /** `${deviceKey}:${uidHex}` — stable per band and file. */
  key: string
  deviceKey: string
  uidHex: string
  dataType: string | null
  size: number
  modifiedTime: number | null
  syncedAt: number
  /** 'imported' = validated and decoded; 'unsupported' = valid download of a type BetterGarmin doesn't map yet. */
  status: 'imported' | 'unsupported'
  fileType: string | null
  activity: BandActivity | null
  /** Original bytes, kept so better decoders can re-import later and so the original FIT can be exported. */
  bytes: Uint8Array
}

/** A workout in the history, linked to its downloaded band file. Name and notes are the user's own. */
export interface HistoryEntry {
  key: string
  addedAt: number
  name: string | null
  notes: string | null
}

export interface BandFileStore {
  has(key: string): Promise<boolean>
  put(record: BandFileRecord): Promise<void>
  all(): Promise<BandFileRecord[]>
  get(key: string): Promise<BandFileRecord | undefined>
  /** Workout history entries (one per downloaded activity). */
  addHistory(key: string): Promise<void>
  history(): Promise<HistoryEntry[]>
  updateHistory(key: string, patch: Partial<Pick<HistoryEntry, 'name' | 'notes'>>): Promise<void>
  /** Removes a file and its history entry from this device. Nothing on the band is touched. */
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

const DB_NAME = 'bettergarmin-band'
let dbPromise: Promise<IDBPDatabase> | null = null
const db = () =>
  (dbPromise ??= openDB(DB_NAME, 2, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'key' })
      if (!d.objectStoreNames.contains('history')) d.createObjectStore('history', { keyPath: 'key' })
    },
  }))

/** Fires after any write, so history screens refresh. */
export const bandStoreEvents = new EventTarget()
const changed = () => bandStoreEvents.dispatchEvent(new Event('change'))

export const indexedDbBandStore: BandFileStore = {
  async has(key) {
    return (await (await db()).getKey('files', key)) !== undefined
  },
  async put(record) {
    const tx = (await db()).transaction('files', 'readwrite')
    await tx.store.put(record)
    await tx.done // resolves only once the write is committed
    changed()
  },
  async all() {
    return (await db()).getAll('files')
  },
  async get(key) {
    return (await db()).get('files', key)
  },
  async addHistory(key) {
    const d = await db()
    if (await d.getKey('history', key)) return
    const tx = d.transaction('history', 'readwrite')
    await tx.store.put({ key, addedAt: Date.now(), name: null, notes: null } satisfies HistoryEntry)
    await tx.done
    changed()
  },
  async history() {
    return (await db()).getAll('history')
  },
  async updateHistory(key, patch) {
    const d = await db()
    const cur = ((await d.get('history', key)) as HistoryEntry | undefined) ?? { key, addedAt: Date.now(), name: null, notes: null }
    await d.put('history', { ...cur, ...patch })
    changed()
  },
  async remove(key) {
    const tx = (await db()).transaction(['files', 'history'], 'readwrite')
    await tx.objectStore('files').delete(key)
    await tx.objectStore('history').delete(key)
    await tx.done
    changed()
  },
  async clear() {
    const tx = (await db()).transaction(['files', 'history'], 'readwrite')
    await tx.objectStore('files').clear()
    await tx.objectStore('history').clear()
    await tx.done
    changed()
  },
}

export function memoryBandStore(): BandFileStore & { records: Map<string, BandFileRecord>; entries: Map<string, HistoryEntry> } {
  const records = new Map<string, BandFileRecord>()
  const entries = new Map<string, HistoryEntry>()
  return {
    records,
    entries,
    has: async (k) => records.has(k),
    put: async (r) => void records.set(r.key, r),
    all: async () => [...records.values()],
    get: async (k) => records.get(k),
    addHistory: async (k) => void (entries.has(k) || entries.set(k, { key: k, addedAt: Date.now(), name: null, notes: null })),
    history: async () => [...entries.values()],
    updateHistory: async (k, p) => void entries.set(k, { ...(entries.get(k) ?? { key: k, addedAt: Date.now(), name: null, notes: null }), ...p }),
    remove: async (k) => {
      records.delete(k)
      entries.delete(k)
    },
    clear: async () => {
      records.clear()
      entries.clear()
    },
  }
}
