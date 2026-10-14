import type { DbKind } from './types'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }

class SqliteClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, PendingRequest>()

  constructor() {
    this.worker = new Worker(new URL('../workers/sqlite.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const req = this.pending.get(msg.id)
      if (!req) return
      this.pending.delete(msg.id)
      if (msg.ok) req.resolve(msg.result)
      else req.reject(new Error(msg.error))
    }
  }

  private call<T>(payload: Record<string, unknown>): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.worker.postMessage({ id, ...payload })
    })
  }

  /** Loads an arbitrary user-provided file, auto-identifying which GarminDB DB it is. */
  loadFile(fileName: string, buffer: ArrayBuffer): Promise<{ kind: DbKind | null; fileName: string }> {
    return this.call({ type: 'loadFile', fileName, buffer })
  }

  /** Loads a buffer we already know the kind of (e.g. restoring from IndexedDB cache or demo data). */
  loadKnown(kind: DbKind, buffer: ArrayBuffer): Promise<{ kind: DbKind }> {
    return this.call({ type: 'loadKnown', kind, buffer })
  }

  query<T>(kind: DbKind, sql: string, params: (string | number | null)[] = []): Promise<T[]> {
    return this.call<T[]>({ type: 'query', kind, sql, params })
  }

  hasKind(kind: DbKind): Promise<boolean> {
    return this.call({ type: 'hasKind', kind })
  }

  listKinds(): Promise<DbKind[]> {
    return this.call({ type: 'listKinds' })
  }

  clear(): Promise<void> {
    return this.call({ type: 'clear' })
  }
}

/** One shared worker + connection pool for the whole app. */
export const sqliteClient = new SqliteClient()
