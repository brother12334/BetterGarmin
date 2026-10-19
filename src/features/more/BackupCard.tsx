import { useRef, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { downloadBlob } from '../../lib/download'
import { downloadObjectsAsCsv } from '../../lib/csv'
import { indexedDbBandStore, type BandFileRecord, type HistoryEntry } from '../../lib/band/bandFileStore'
import { clearBandIndex } from '../../lib/band/bandIndex'
import { exportStrengthLog, importStrengthLog, clearAllWorkouts } from '../../db/strengthLog'
import { loadRoutines, saveRoutines, type Routine } from '../routines/routines'
import { loadWorkoutHistory, sportLabel } from '../history/useWorkoutHistory'

const BACKUP_VERSION = 1

const toB64 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Workout CSV, a full backup file (routines, notes, history, original band files) and restore, plus deletion. */
export function BackupCard() {
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const csv = async () => {
    const items = await loadWorkoutHistory()
    downloadObjectsAsCsv(
      'bettergarmin-workouts',
      items
        .filter((i) => i.kind !== 'pending')
        .map((i) => {
          const a = i.kind === 'band' ? i.activity : null
          const w = i.kind === 'log' ? i.workout : null
          return {
            date: i.at ? new Date(i.at).toISOString() : '',
            name: i.title,
            type: a ? sportLabel(a) : i.type,
            source: i.kind === 'band' ? 'band' : (w?.source ?? 'manual'),
            duration_min: a?.elapsed != null ? Math.round(a.elapsed / 60) : w?.startedAtEpochMs && w.finishedAtEpochMs ? Math.round((w.finishedAtEpochMs - w.startedAtEpochMs) / 60000) : '',
            calories: a?.calories ?? '',
            avg_hr: a?.avgHr ?? '',
            max_hr: a?.maxHr ?? '',
            sets: w ? w.sets.length : (a?.sets?.length ?? ''),
            notes: (i.kind === 'band' ? i.entry?.notes : w?.notes) ?? '',
          }
        }),
    )
  }

  const backup = async () => {
    const [files, history, strength] = await Promise.all([indexedDbBandStore.all(), indexedDbBandStore.history(), exportStrengthLog()])
    const data = {
      app: 'BetterGarmin',
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      routines: loadRoutines(),
      bandHistory: history,
      bandFiles: files.map((f) => ({ ...f, bytes: toB64(f.bytes) })),
      strength,
    }
    downloadBlob(`bettergarmin-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json')
    setMsg('Backup saved. It contains your health and workout data, so keep it somewhere private.')
  }

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (data?.app !== 'BetterGarmin') throw new Error("That isn't a BetterGarmin backup file")
      const byId = new Map(loadRoutines().map((r) => [r.id, r]))
      for (const r of (data.routines ?? []) as Routine[]) byId.set(r.id, r)
      saveRoutines([...byId.values()])
      for (const f of (data.bandFiles ?? []) as (Omit<BandFileRecord, 'bytes'> & { bytes: string })[]) await indexedDbBandStore.put({ ...f, bytes: fromB64(f.bytes) })
      for (const h of (data.bandHistory ?? []) as HistoryEntry[]) {
        await indexedDbBandStore.addHistory(h.key)
        await indexedDbBandStore.updateHistory(h.key, { name: h.name, notes: h.notes })
      }
      const n = data.strength ? await importStrengthLog(data.strength) : 0
      setMsg(`Restored ${data.routines?.length ?? 0} routines, ${data.bandFiles?.length ?? 0} band files and ${n} strength-log records. Existing items with the same ID were replaced; nothing else was removed.`)
    } catch (e) {
      setMsg(`Restore failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const wipe = async (what: 'band' | 'routines' | 'strength') => {
    const label = { band: 'all workouts and files downloaded from the band', routines: 'all routines and unfinished routine drafts', strength: 'all logged and imported strength workouts' }[what]
    if (!confirm(`Delete ${label} from this device? This can't be undone. Nothing on your band is touched.`)) return
    if (what === 'band') {
      await indexedDbBandStore.clear()
      clearBandIndex()
    } else if (what === 'routines') {
      saveRoutines([])
      Object.keys(localStorage)
        .filter((k) => k.startsWith('bettergarmin:routineDraft:'))
        .forEach((k) => localStorage.removeItem(k))
    } else await clearAllWorkouts()
    setMsg('Deleted.')
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">Backup, export and privacy</p>
        <p className="text-xs text-[var(--text-tertiary)]">
          Everything here lives only on this phone, in this browser. It's never uploaded. Original band files can also be exported one by one from each
          workout.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={csv}>
          Workouts CSV
        </Button>
        <Button variant="secondary" onClick={backup}>
          Back up everything
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          Restore backup
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
      </div>
      {msg && <p className="text-sm text-[var(--text-secondary)]" role="status">{msg}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--text-secondary)]">Delete data from this device</summary>
        <div className="mt-2 flex flex-col items-start gap-1">
          <Button variant="ghost" onClick={() => wipe('band')}>
            Delete band workouts and files
          </Button>
          <Button variant="ghost" onClick={() => wipe('routines')}>
            Delete routines
          </Button>
          <Button variant="ghost" onClick={() => wipe('strength')}>
            Delete strength log
          </Button>
          <p className="text-xs text-[var(--text-tertiary)]">Garmin data (from the cloud or files) is removed with "Forget my data" above.</p>
        </div>
      </details>
    </Card>
  )
}
