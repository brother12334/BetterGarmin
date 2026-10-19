import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { sortedRoutines, useRoutines } from '../routines/routines'
import { useWorkoutHistory } from '../history/useWorkoutHistory'
import { SaveStatus } from '../history/SaveStatus'
import { useLastBandSync } from '../band/useLastBandSync'
import { formatRelativeTime } from '../../lib/relativeTime'

/** Today's training at a glance: pinned routines to start, the latest workout and its save status. */
export function TrainingWidget() {
  const navigate = useNavigate()
  const pinned = sortedRoutines(useRoutines()).filter((r) => r.pinned)
  const { items } = useWorkoutHistory()
  const lastSync = useLastBandSync()
  const latest = items?.find((i) => i.kind !== 'log') ?? items?.[0]
  if (!pinned.length && !latest) return null
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">Training</p>
        <span className="text-xs text-[var(--text-tertiary)]">Band synced {lastSync ? formatRelativeTime(new Date(lastSync)) : 'never'}</span>
      </div>
      {pinned.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pinned.map((r) => (
            <button key={r.id} type="button" onClick={() => navigate(`/training/routines/${r.id}/run`)} className="min-h-11 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-black">
              ▶ {r.name}
            </button>
          ))}
        </div>
      )}
      {latest && (
        <Link to={latest.kind === 'band' ? `/training/history/${encodeURIComponent(latest.id)}` : latest.kind === 'log' ? `/training/strength/workout/${latest.workout.id}` : '/training/history'} className="flex flex-col gap-1">
          <span className="text-sm">
            Latest: <b>{latest.title}</b>
            <span className="text-[var(--text-tertiary)]">{latest.at ? ` · ${new Date(latest.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}</span>
          </span>
          {latest.kind !== 'log' && <SaveStatus status={latest.status} compact />}
        </Link>
      )}
    </Card>
  )
}
