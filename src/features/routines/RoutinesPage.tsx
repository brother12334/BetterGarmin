import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { useUnits } from '../../app/units'
import { convertWeight, weightUnitLabel } from '../../lib/units'
import { useStrengthLog } from '../training/useStrengthLog'
import { useWorkoutHistory } from '../history/useWorkoutHistory'
import { deleteRoutine, duplicateRoutine, loadDraft, moveRoutine, sortedRoutines, upsertRoutine, useRoutines } from './routines'
import { exerciseProgress, weeklyStats } from './progress'

/** Saved routines (pinned first) and progress from logged and recorded workouts. */
export function RoutinesPage() {
  const routines = useRoutines()
  const navigate = useNavigate()
  const ordered = sortedRoutines(routines)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Routines</h1>
        <Button onClick={() => navigate('/training/routines/new/edit')}>New routine</Button>
      </div>

      {ordered.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">No routines yet. Create one with your exercises and target sets, reps and weight, then start it whenever you train.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {ordered.map((r) => {
            const draft = loadDraft(r.id)
            return (
              <li key={r.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {r.pinned && <span aria-label="Pinned">★ </span>}
                        {r.name}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {r.exercises.length} exercise{r.exercises.length === 1 ? '' : 's'} · {r.exercises.reduce((n, e) => n + e.sets, 0)} sets
                      </p>
                    </div>
                    {draft && <Badge tone="warning">Unfinished</Badge>}
                  </div>
                  <Button onClick={() => navigate(`/training/routines/${r.id}/run`)}>{draft ? 'Continue' : 'Start'}</Button>
                  <div className="flex flex-wrap gap-1 text-sm">
                    <Action onClick={() => upsertRoutine({ ...r, pinned: !r.pinned })}>{r.pinned ? 'Unpin' : 'Pin'}</Action>
                    <Action onClick={() => navigate(`/training/routines/${r.id}/edit`)}>Edit</Action>
                    <Action onClick={() => duplicateRoutine(r.id)}>Duplicate</Action>
                    <Action onClick={() => moveRoutine(r.id, -1)} label="Move up">
                      ↑
                    </Action>
                    <Action onClick={() => moveRoutine(r.id, 1)} label="Move down">
                      ↓
                    </Action>
                    <Action onClick={() => confirm(`Delete "${r.name}"? Logged workouts are kept.`) && deleteRoutine(r.id)}>Delete</Action>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Progress />
    </div>
  )
}

function Action({ onClick, children, label }: { onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="min-h-11 rounded-control px-3 text-[var(--text-secondary)] hover:bg-[var(--ring-track)]">
      {children}
    </button>
  )
}

function Progress() {
  const { workouts } = useStrengthLog()
  const { items } = useWorkoutHistory()
  const { units } = useUnits()
  const w = (kg: number) => `${Math.round(convertWeight(kg, units) * 10) / 10} ${weightUnitLabel(units)}`

  const weeks = useMemo(() => {
    const sessions = (items ?? []).flatMap((i) => {
      if (i.at == null) return []
      if (i.kind === 'band') return [{ at: i.at, duration: i.activity.elapsed }]
      if (i.kind === 'log') return [{ at: i.at, duration: i.workout.startedAtEpochMs && i.workout.finishedAtEpochMs ? (i.workout.finishedAtEpochMs - i.workout.startedAtEpochMs) / 1000 : null }]
      return []
    })
    return weeklyStats(sessions, 8)
  }, [items])
  const progress = useMemo(() => exerciseProgress(workouts), [workouts])
  const maxCount = Math.max(1, ...weeks.map((x) => x.workouts))
  const thisWeek = weeks[weeks.length - 1]
  const unknown = weeks.reduce((n, x) => n + x.unknownDuration, 0)

  return (
    <>
      <h2 className="mt-2 text-xl font-bold">Progress</h2>
      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold">Workouts per week</p>
          <p className="text-sm text-[var(--text-secondary)]">
            This week: {thisWeek.workouts} · {Math.round(thisWeek.seconds / 60)} min
          </p>
        </div>
        <div className="flex h-28 items-end gap-2" role="img" aria-label={`Workouts per week over the last 8 weeks: ${weeks.map((x) => x.workouts).join(', ')}`}>
          {weeks.map((x) => (
            <div key={x.week} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs tabular-nums text-[var(--text-secondary)]">{x.workouts || ''}</span>
              <div className="w-full rounded-t-md bg-[var(--accent)]" style={{ height: `${(x.workouts / maxCount) * 80}px`, minHeight: x.workouts ? 4 : 0 }} />
              <span className="text-[10px] text-[var(--text-tertiary)]">{new Date(`${x.week}T12:00:00`).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Total training time, last 8 weeks: <b>{Math.round(weeks.reduce((n, x) => n + x.seconds, 0) / 3600 * 10) / 10} h</b>
          {unknown > 0 && <span className="text-[var(--text-tertiary)]"> ({unknown} workout{unknown === 1 ? '' : 's'} without a recorded duration not counted)</span>}
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="font-semibold">Strength by exercise</p>
        {progress.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">Log sets with a weight and reps to see progress and personal records.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-panel)]">
            {progress.slice(0, 12).map((p) => {
              const diff = p.previous ? p.latest.e1rm - p.previous.e1rm : null
              return (
                <li key={p.exercise} className="flex flex-col gap-1 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.exercise}</span>
                    {p.isRecord && <Badge tone="success">Personal record</Badge>}
                  </div>
                  <p className="text-sm tabular-nums text-[var(--text-secondary)]">
                    Latest {p.latest.reps} × {w(p.latest.weight)}
                    {p.previous ? ` · before ${p.previous.reps} × ${w(p.previous.weight)}` : ' · first session'}
                    {diff != null && diff !== 0 && <span className={diff > 0 ? 'text-emerald-500' : 'text-rose-400'}> ({diff > 0 ? '+' : '−'}{w(Math.abs(diff))} est. 1RM)</span>}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Best {p.best.reps} × {w(p.best.weight)} on {new Date(`${p.best.day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
        <Link to="/training/strength" className="text-sm text-[var(--accent)]">
          Volume, muscle balance and 1RM charts ›
        </Link>
      </Card>
    </>
  )
}
