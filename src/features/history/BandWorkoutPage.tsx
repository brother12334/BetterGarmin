import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Chart } from '../../components/ui/Chart'
import { Skeleton } from '../../components/ui/Skeleton'
import { AXIS_TEXT, GRID_LINE, fade } from '../../components/charts/chartKit'
import { useUnits } from '../../app/units'
import { convertWeight, formatDistance, weightUnitLabel } from '../../lib/units'
import { indexedDbBandStore, type BandFileRecord, type HistoryEntry } from '../../lib/band/bandFileStore'
import { validateAndDecodeFit, type BandActivity } from '../../lib/band/fitImport'
import { downloadBlob } from '../../lib/download'
import { formatDuration, sportLabel } from './useWorkoutHistory'
import { SaveStatus } from './SaveStatus'

const HEART = '#f43f5e'
const humanize = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()).trim()

/** One workout downloaded from the band: what was recorded, what wasn't, the user's name and notes, and the original file. */
export function BandWorkoutPage() {
  const { key = '' } = useParams()
  const id = decodeURIComponent(key)
  const navigate = useNavigate()
  const { units } = useUnits()
  const [record, setRecord] = useState<BandFileRecord | null | undefined>(undefined)
  const [entry, setEntry] = useState<HistoryEntry | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([indexedDbBandStore.get(id), indexedDbBandStore.history()]).then(([r, h]) => {
      if (cancelled) return
      const e = h.find((x) => x.key === id) ?? null
      setRecord(r ?? null)
      setEntry(e)
      setName(e?.name ?? '')
      setNotes(e?.notes ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Re-read the original file, so newer decoding (e.g. strength sets) applies to workouts synced earlier.
  const activity: BandActivity | null = useMemo(() => {
    if (!record) return null
    const r = validateAndDecodeFit(record.bytes, record.size)
    return r.ok && r.activity ? r.activity : record.activity
  }, [record])

  if (record === undefined) return <Skeleton className="h-64 w-full" />
  if (!record || !activity)
    return (
      <Card>
        <p className="text-sm">This workout isn't on this device. It may have been deleted here; the original is still on your band until the band overwrites it.</p>
        <Link to="/training/history" className="mt-3 inline-block text-sm text-[var(--accent)]">
          Back to history
        </Link>
      </Card>
    )

  const save = async () => {
    await indexedDbBandStore.updateHistory(id, { name: name.trim() || null, notes: notes.trim() || null })
    setEntry((e) => ({ key: id, addedAt: e?.addedAt ?? Date.now(), name: name.trim() || null, notes: notes.trim() || null }))
    setSaved('Saved')
    setTimeout(() => setSaved(null), 2000)
  }
  const start = activity.startTime ? new Date(activity.startTime) : null
  const fileName = `${(entry?.name || sportLabel(activity)).replace(/[^\w-]+/g, '-')}-${activity.startTime?.slice(0, 10) ?? record.uidHex.slice(0, 8)}.fit`

  const metrics: [string, string | null][] = [
    ['Duration', formatDuration(activity.elapsed)],
    ['Moving time', formatDuration(activity.timer)],
    ['Calories', activity.calories != null ? `${activity.calories} kcal` : null],
    ['Avg heart rate', activity.avgHr != null ? `${activity.avgHr} bpm` : null],
    ['Max heart rate', activity.maxHr != null ? `${activity.maxHr} bpm` : null],
    ['Distance', activity.distance ? formatDistance(activity.distance / 1000, units) : null],
    ['Aerobic effect', activity.aerobicTE != null ? activity.aerobicTE.toFixed(1) : null],
    ['Anaerobic effect', activity.anaerobicTE != null ? activity.anaerobicTE.toFixed(1) : null],
  ]
  const sets = activity.sets ?? []

  return (
    <div className="flex flex-col gap-4">
      <Link to="/training/history" className="text-sm text-[var(--accent)]">
        ‹ Workout history
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{entry?.name || sportLabel(activity)}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {sportLabel(activity)} · {start ? start.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }) : 'start time not recorded'}
        </p>
      </div>

      <Card>
        <SaveStatus status={{ onBand: true, downloaded: true, inHistory: entry != null, lastError: null }} />
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Recorded</p>
        <dl className="grid grid-cols-2 gap-3">
          {metrics.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-[var(--text-tertiary)]">{k}</dt>
              <dd className={v ? 'text-lg font-semibold tabular-nums' : 'text-sm text-[var(--text-tertiary)]'}>{v ?? 'Not recorded'}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <p className="mb-2 font-semibold">Heart rate</p>
        {activity.hr.length > 1 ? (
          <Chart
            height={200}
            option={{
              grid: { left: 8, right: 12, top: 10, bottom: 8, containLabel: true },
              xAxis: {
                type: 'value',
                min: 0,
                max: Math.ceil((activity.hr[activity.hr.length - 1][0] - activity.hr[0][0]) / 60_000),
                axisLabel: { color: AXIS_TEXT, fontSize: 11, formatter: '{value} min' },
                splitLine: { show: false },
                axisLine: { lineStyle: { color: GRID_LINE } },
              },
              yAxis: { type: 'value', scale: true, axisLabel: { color: AXIS_TEXT, fontSize: 11 }, splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } } },
              tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${v} bpm` },
              series: [
                {
                  type: 'line',
                  showSymbol: false,
                  data: activity.hr.map(([t, v]) => [Math.round(((t - activity.hr[0][0]) / 60_000) * 10) / 10, v]),
                  lineStyle: { color: HEART, width: 2 },
                  areaStyle: { color: fade(HEART, 0.2) },
                },
              ],
            }}
          />
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">No heart-rate samples in this recording.</p>
        )}
      </Card>

      <Card>
        <p className="mb-2 font-semibold">Exercises</p>
        {sets.length ? (
          <ol className="flex flex-col divide-y divide-[var(--border-panel)]">
            {sets.map((s, i) => (
              <li key={i} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="text-[var(--text-tertiary)]">Set {i + 1}</span> {s.exercise ? humanize(s.exercise) : 'Exercise not recorded'}
                </span>
                <span className="tabular-nums text-[var(--text-secondary)]">
                  {s.reps != null ? `${s.reps} reps` : 'reps —'}
                  {s.weight ? ` · ${Math.round(convertWeight(s.weight, units) * 10) / 10} ${weightUnitLabel(units)}` : ''}
                  {s.duration != null ? ` · ${Math.round(s.duration)}s` : ''}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">The band didn't record individual sets for this workout.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={sportLabel(activity)}
            className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="How did it feel? Anything to remember next time?"
            className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2 text-base"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={save}>Save</Button>
          {saved && <span className="text-sm text-emerald-500">{saved}</span>}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="font-semibold">Original file</p>
        <p className="text-sm text-[var(--text-secondary)]">
          The untouched FIT file from your band ({record.size.toLocaleString()} bytes). It opens in Garmin Connect, Strava and most fitness apps.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadBlob(fileName, record.bytes.slice().buffer, 'application/vnd.ant.fit')}>
            Export FIT
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (!confirm('Delete this workout from this device? The recording on your band is not touched.')) return
              await indexedDbBandStore.remove(id)
              navigate('/training/history')
            }}
          >
            Delete from this device
          </Button>
        </div>
      </Card>
    </div>
  )
}
