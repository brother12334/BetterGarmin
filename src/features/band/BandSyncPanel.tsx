import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { band } from '../../lib/band/bandStore'
import { indexedDbBandStore, type BandFileRecord } from '../../lib/band/bandFileStore'
import { useData } from '../../app/DataProvider'
import type { WellnessSummary } from '../../lib/band/bandWellness'
import { syncBand, type SyncProgress, type SyncReport } from '../../lib/band/bandSync'


/** Experimental direct sync: downloads new files from the band over Bluetooth and shows what was imported. */
export function BandSyncPanel({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [report, setReport] = useState<SyncReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<BandFileRecord[] | null>(null)
  const [wellness, setWellness] = useState<WellnessSummary | null>(null)
  const { refreshBandData } = useData()

  const refresh = () =>
    indexedDbBandStore
      .all()
      .then((r) => setRecords(r.sort((a, b) => (b.activity?.startTime ?? '').localeCompare(a.activity?.startTime ?? ''))))
      .catch(() => setRecords([]))
  useEffect(() => {
    void refresh()
  }, [])

  const run = async () => {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const r = await syncBand(band, indexedDbBandStore, setProgress)
      setReport(r)
      const w = await refreshBandData()
      setWellness(w)
      for (const line of w?.diagnostics ?? []) band.addLog('info', `File: ${line}`)
      band.addLog('info', `All-day data: ${w?.files ? `${w.files} files, ${w.stress} stress, ${w.bodyBattery} energy, ${w.hr} heart-rate samples, ${w.nights} nights; messages ${JSON.stringify(w.counts)}` : 'none found'}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setProgress(null)
      void refresh()
    }
  }

  const counts = report?.outcomes.reduce<Record<string, number>>((m, o) => ({ ...m, [o.result]: (m[o.result] ?? 0) + 1 }), {})
  const activities = records?.filter((r) => r.status === 'imported') ?? []
  const cur = progress?.current

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-panel)] pt-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Sync from band</p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Downloads new files over Bluetooth, checks each one, and imports stress, energy, heart rate, sleep and activities. Nothing on the band is deleted or changed. Experimental: not yet
            confirmed on a real band.
          </p>
        </div>
        <Button loading={busy} variant="secondary" onClick={run} disabled={!ready || busy} className="shrink-0">
          Sync
        </Button>
      </div>

      {busy && (
        <div className="flex flex-col gap-2 text-xs text-[var(--text-secondary)]">
          <p>
            {progress?.phase === 'listing' && 'Listing files on the band…'}
            {cur && `File ${cur.index + 1} of ${cur.total}${cur.dataType ? ` (${cur.dataType})` : ''}: ${cur.received.toLocaleString()} of ${cur.size.toLocaleString()} bytes${cur.attempt > 1 ? ` (retry ${cur.attempt - 1})` : ''}`}
          </p>
          {cur && cur.size > 0 && (
            <div className="h-1 overflow-hidden rounded-full bg-[var(--ring-track)]">
              <i className="block h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.min(100, (cur.received / cur.size) * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {report && counts && (
        <div className="flex flex-col gap-2 text-xs text-[var(--text-secondary)]">
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{counts.imported ?? 0} imported</Badge>
            <Badge>{counts['skipped-duplicate'] ?? 0} already synced</Badge>
            {counts.unsupported ? <Badge>{counts.unsupported} other files</Badge> : null}
            {counts.failed ? <Badge tone="danger">{counts.failed} failed</Badge> : null}
          </div>
          <p>
            {wellness?.files
              ? `All-day data: ${wellness.stress.toLocaleString()} stress, ${wellness.bodyBattery.toLocaleString()} energy and ${wellness.hr.toLocaleString()} heart-rate readings, ${wellness.nights} night${wellness.nights === 1 ? '' : 's'} of sleep.`
              : 'No stress, energy, heart-rate or sleep data found in the synced files yet.'}
          </p>
          {wellness && wellness.diagnostics.length > 0 && (
            <details className="text-[11px] text-[var(--text-tertiary)]">
              <summary className="cursor-pointer">File details ({wellness.diagnostics.length})</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all font-mono">{wellness.diagnostics.join('\n')}</pre>
            </details>
          )}
          {report.outcomes
            .filter((o) => o.result === 'failed')
            .slice(0, 5)
            .map((o, i) => (
              <p key={i} className="text-rose-400">
                {o.dataType ?? 'File'}: {o.error}
              </p>
            ))}
        </div>
      )}

      {activities.length > 0 && (
        <Link to="/training/history" className="text-sm font-medium text-[var(--accent)]">
          {activities.length} workout{activities.length === 1 ? '' : 's'} from the band · open Workout history ›
        </Link>
      )}
    </div>
  )
}
