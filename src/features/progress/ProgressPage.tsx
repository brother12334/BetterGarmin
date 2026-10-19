import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { useUnits } from '../../app/units'
import { convertWeight, weightUnitLabel } from '../../lib/units'
import { useStrengthLog } from '../training/useStrengthLog'
import { useWorkoutHistory } from '../history/useWorkoutHistory'
import { exerciseProgress, weeklyStats } from './progress'

/** Progress from recorded and imported workouts: weekly frequency, training time and personal records. */
export function ProgressPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link to="/training" className="text-sm text-[var(--accent)]">
        ‹ Training
      </Link>
      <Progress />
    </div>
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
      <h1 className="text-2xl font-bold">Progress</h1>
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
          <p className="text-sm text-[var(--text-tertiary)]">Import workouts with weights and reps from Element 26 to see progress and personal records.</p>
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
