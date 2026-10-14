import { openDB, type IDBPDatabase } from 'idb'
import type { DbKind } from './types'

const DB_NAME = 'bettergarmin-cache'
const STORE_NAME = 'db-files'
const DB_VERSION = 1

interface CachedFile {
  kind: DbKind
  fileName: string
  buffer: ArrayBuffer
  savedAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'kind' })
        }
      },
    })
  }
  return dbPromise
}

/** Persists a loaded DB file's raw bytes so the user doesn't have to re-pick files on their next visit. */
export async function cacheDbFile(kind: DbKind, fileName: string, buffer: ArrayBuffer): Promise<void> {
  const db = await getDb()
  const entry: CachedFile = { kind, fileName, buffer, savedAt: Date.now() }
  await db.put(STORE_NAME, entry)
}

export async function getCachedFiles(): Promise<CachedFile[]> {
  try {
    const db = await getDb()
    return await db.getAll(STORE_NAME)
  } catch {
    return []
  }
}

/** Wipes every cached DB file. Backs the "Forget my data" control. */
export async function clearCachedFiles(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_NAME)
}

export async function hasCachedData(): Promise<boolean> {
  const files = await getCachedFiles()
  return files.length > 0
}
