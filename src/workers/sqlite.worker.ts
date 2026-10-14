/// <reference lib="webworker" />
import initSqlJs from 'sql.js'
import { identifyDbKind } from '../db/identify'
import type { DbKind } from '../db/types'

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>
type Database = InstanceType<SqlJsStatic['Database']>

interface LoadFileRequest {
  id: number
  type: 'loadFile'
  fileName: string
  buffer: ArrayBuffer
}

interface LoadKnownRequest {
  id: number
  type: 'loadKnown'
  kind: DbKind
  buffer: ArrayBuffer
}

interface QueryRequest {
  id: number
  type: 'query'
  kind: DbKind
  sql: string
  params?: (string | number | null)[]
}

interface HasKindRequest {
  id: number
  type: 'hasKind'
  kind: DbKind
}

interface ClearRequest {
  id: number
  type: 'clear'
}

interface ListKindsRequest {
  id: number
  type: 'listKinds'
}

interface RawQueryRequest {
  id: number
  type: 'rawQuery'
  kind: DbKind
  sql: string
}

type Request =
  | LoadFileRequest
  | LoadKnownRequest
  | QueryRequest
  | HasKindRequest
  | ClearRequest
  | ListKindsRequest
  | RawQueryRequest

type Row = Record<string, string | number | null>

let sqlJsPromise: Promise<SqlJsStatic> | null = null
const databases = new Map<DbKind, Database>()

function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
    })
  }
  return sqlJsPromise
}

function tableNamesOf(db: Database): string[] {
  const result = db.exec("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
  if (result.length === 0) return []
  return result[0].values.map((v) => String(v[0]))
}

function runQuery(db: Database, sql: string, params: (string | number | null)[] = []): Row[] {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    const rows: Row[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as Row)
    }
    return rows
  } finally {
    stmt.free()
  }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const msg = event.data
  try {
    switch (msg.type) {
      case 'loadFile': {
        const SQL = await getSqlJs()
        const db = new SQL.Database(new Uint8Array(msg.buffer))
        const tables = tableNamesOf(db)
        const kind = identifyDbKind(tables)
        if (!kind) {
          db.close()
          self.postMessage({ id: msg.id, ok: true, result: { kind: null, fileName: msg.fileName } })
          return
        }
        databases.get(kind)?.close()
        databases.set(kind, db)
        self.postMessage({ id: msg.id, ok: true, result: { kind, fileName: msg.fileName } })
        return
      }
      case 'loadKnown': {
        const SQL = await getSqlJs()
        const db = new SQL.Database(new Uint8Array(msg.buffer))
        databases.get(msg.kind)?.close()
        databases.set(msg.kind, db)
        self.postMessage({ id: msg.id, ok: true, result: { kind: msg.kind } })
        return
      }
      case 'query': {
        const db = databases.get(msg.kind)
        if (!db) {
          self.postMessage({ id: msg.id, ok: true, result: [] })
          return
        }
        const rows = runQuery(db, msg.sql, msg.params ?? [])
        self.postMessage({ id: msg.id, ok: true, result: rows })
        return
      }
      case 'hasKind': {
        self.postMessage({ id: msg.id, ok: true, result: databases.has(msg.kind) })
        return
      }
      case 'listKinds': {
        self.postMessage({ id: msg.id, ok: true, result: Array.from(databases.keys()) })
        return
      }
      case 'rawQuery': {
        const db = databases.get(msg.kind)
        if (!db) {
          self.postMessage({ id: msg.id, ok: false, error: `${msg.kind} is not loaded.` })
          return
        }
        const results = db.exec(msg.sql)
        const last = results[results.length - 1]
        const result = last ? { columns: last.columns, rows: last.values } : { columns: [], rows: [] }
        self.postMessage({ id: msg.id, ok: true, result })
        return
      }
      case 'clear': {
        for (const db of databases.values()) db.close()
        databases.clear()
        self.postMessage({ id: msg.id, ok: true, result: null })
        return
      }
    }
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
