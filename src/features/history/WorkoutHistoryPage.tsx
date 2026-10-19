import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { useUnits } from '../../app/units'
import { formatDistance } from '../../lib/units'
import { formatDuration, useWorkoutHistory, type HistoryItem } from './useWorkoutHistory'
import { SaveStatus } from './SaveStatus'

type Filter = 'all' | 'band' | 'log'

const fmtDate = (t: number | null) =>
  t == null ? 'Date unknown' : new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function searchText(i: HistoryItem): string {
  const notes = i.kind === 'band' ? i.entry?.notes : i.kind === 'log' ? i.workout.notes : ''
  const exercises = i.kind === 'log' ? i.workout.sets.map((s) => s.exercise).join(' ') : ''
  return `${i.title} ${i.type} ${notes ?? ''} ${exercises} ${fmtDate(i.at)}`.toLowerCase()
}

/** Every workout in one searchable list: band recordings (with save status) and logged strength sessions. */
export function WorkoutHistoryPage() {
  const { items } = useWorkoutHistory()
  const { units } = useUnits()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (items ?? []).filter((i) => {
      if (filter === 'band' && i.kind === 'log') return false
      if (filter === 'log' && i.kind !== 'log') return false
      const text = searchText(i)
      return words.every((w) => text.includes(w))
    })
  }, [items, q, filter])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Workout history</h1>
        <p className="text-sm text-[var(--text-secondary)]">Band recordings and logged strength sessions.</p>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, type, exercise, note or date"
        aria-label="Search workouts"
        className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-4 py-3 text-base"
      />
      <div className="flex gap-2" role="group" aria-label="Filter workouts">
        {(
          [
            ['all', 'All'],
            ['band', 'From band'],
            ['log', 'Logged'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={`min-h-11 flex-1 rounded-full px-3 text-sm font-medium ${filter === k ? 'bg-[var(--accent)] text-black' : 'bg-[var(--ring-track)] text-[var(--text-secondary)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {items == null ? (
        <Skeleton className="h-40 w-full" />
      ) : shown.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            {items.length === 0 ? 'No workouts yet. Record one on your band and tap Sync now, or import one from Element 26 under Strength.' : 'No workouts match that search.'}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((i) => (
            <li key={i.id}>
              <Row item={i} units={units} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Row({ item, units }: { item: HistoryItem; units: Parameters<typeof formatDistance>[1] }) {
  const href = item.kind === 'band' ? `/training/history/${encodeURIComponent(item.id)}` : item.kind === 'log' ? `/training/strength/workout/${item.workout.id}` : null
  const facts: string[] = []
  if (item.kind === 'band') {
    const a = item.activity
    const d = formatDuration(a.elapsed)
    if (d) facts.push(d)
    if (a.avgHr != null) facts.push(`avg ${a.avgHr} bpm`)
    if (a.calories != null) facts.push(`${a.calories} kcal`)
    if (a.distance) facts.push(formatDistance(a.distance / 1000, units))
  } else if (item.kind === 'log') {
    const w = item.workout
    const exercises = new Set(w.sets.map((s) => s.exercise)).size
    facts.push(`${exercises} exercise${exercises === 1 ? '' : 's'}`, `${w.sets.length} sets`)
    const d = w.startedAtEpochMs && w.finishedAtEpochMs ? formatDuration((w.finishedAtEpochMs - w.startedAtEpochMs) / 1000) : null
    if (d) facts.push(d)
  }
  const body = (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.title}</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {item.type} · {fmtDate(item.at)}
          </p>
        </div>
        {href && <span className="text-[var(--text-tertiary)]">›</span>}
      </div>
      {facts.length > 0 && <p className="text-sm tabular-nums text-[var(--text-secondary)]">{facts.join(' · ')}</p>}
      {item.kind !== 'log' && <SaveStatus status={item.status} compact={item.kind === 'band'} />}
    </Card>
  )
  return href ? <Link to={href}>{body}</Link> : body
}
