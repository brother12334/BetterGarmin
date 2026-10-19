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
  /** Original bytes, kept so better decoders can re-import later without another download. */
  bytes: Uint8Array
}

export interface BandFileStore {
  has(key: string): Promise<boolean>
  put(record: BandFileRecord): Promise<void>
  all(): Promise<BandFileRecord[]>
}

const DB_NAME = 'bettergarmin-band'
let dbPromise: Promise<IDBPDatabase> | null = null
const db = () =>
  (dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('files', { keyPath: 'key' })
    },
  }))

export const indexedDbBandStore: BandFileStore = {
  async has(key) {
    return (await (await db()).getKey('files', key)) !== undefined
  },
  async put(record) {
    const tx = (await db()).transaction('files', 'readwrite')
    await tx.store.put(record)
    await tx.done // resolves only once the write is committed
  },
  async all() {
    return (await db()).getAll('files')
  },
}

export function memoryBandStore(): BandFileStore & { records: Map<string, BandFileRecord> } {
  const records = new Map<string, BandFileRecord>()
  return {
    records,
    has: async (k) => records.has(k),
    put: async (r) => void records.set(r.key, r),
    all: async () => [...records.values()],
  }
}
