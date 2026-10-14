import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useData } from '../../app/DataProvider'
import { sqliteClient } from '../../db/client'
import { DB_KIND_INFO, type DbKind } from '../../db/types'
import { downloadCsv } from '../../lib/csv'

const ROW_LIMIT = 500
const READ_ONLY_PATTERN = /^\s*(select|with|explain|pragma)\b/i

interface QueryResult {
  columns: string[]
  rows: unknown[][]
}

export function SqlConsole() {
  const { loadedKinds } = useData()
  const [kind, setKind] = useState<DbKind | null>(loadedKinds[0] ?? null)
  const [sql, setSql] = useState('SELECT * FROM sqlite_master WHERE type = \'table\';')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const selectedKind = kind && loadedKinds.includes(kind) ? kind : (loadedKinds[0] ?? null)

  async function run() {
    if (!selectedKind) return
    if (!READ_ONLY_PATTERN.test(sql)) {
      setError('Only read-only statements are allowed here: SELECT, WITH, EXPLAIN, or PRAGMA.')
      setResult(null)
      return
    }
    setRunning(true)
    setError(null)
    try {
      const res = await sqliteClient.rawQuery(selectedKind, sql)
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  if (loadedKinds.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">Load some data first to query it here.</p>
  }

  const shownRows = result?.rows.slice(0, ROW_LIMIT) ?? []

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--text-tertiary)]">
        Run read-only SQL directly against a loaded database file. Handy for exploring the raw GarminDB schema.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedKind ?? ''}
          onChange={(e) => setKind(e.target.value as DbKind)}
          className="rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1 text-sm text-[var(--text-primary)]"
        >
          {loadedKinds.map((k) => (
            <option key={k} value={k}>
              {DB_KIND_INFO[k].label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={4}
        spellCheck={false}
        className="w-full rounded-xl border border-[var(--border-panel)] bg-[var(--bg-panel)] p-3 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-sky-400/50"
      />
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={run} disabled={running || !selectedKind}>
          {running ? 'Running…' : 'Run query'}
        </Button>
        {result && result.rows.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => downloadCsv(`${selectedKind}-query`, result.columns, result.rows)}
          >
            Export CSV
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {result && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-panel)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-panel)] bg-[var(--bg-panel)] text-[var(--text-tertiary)]">
                {result.columns.map((c) => (
                  <th key={c} className="px-2 py-1.5 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownRows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--border-panel)] last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1.5 tabular-nums">
                      {cell == null ? '—' : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.rows.length === 0 && (
            <p className="p-3 text-center text-sm text-[var(--text-tertiary)]">No rows returned.</p>
          )}
          {result.rows.length > ROW_LIMIT && (
            <p className="p-2 text-center text-xs text-[var(--text-tertiary)]">
              Showing first {ROW_LIMIT} of {result.rows.length} rows. Export CSV for the full result.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
