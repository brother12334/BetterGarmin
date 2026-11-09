import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { useWorkoutHistory } from '../history/useWorkoutHistory'
import { SaveStatus } from '../history/SaveStatus'
import { useLastBandSync } from '../band/useLastBandSync'
import { formatRelativeTime } from '../../lib/relativeTime'

/** Today's training at a glance: the latest workout and its save status. */
export function TrainingWidget() {
  const { items } = useWorkoutHistory()
  const lastSync = useLastBandSync()
  const latest = items?.find((i) => i.kind !== 'log') ?? items?.[0]
  if (!latest) return null
  return (
    <Card className="flex flex-col gap-2 py-4">
      <div className="flex items-baseline justify-between">
        <p className="sign-caps text-sm">Training</p>
        {/* Direct band sync is opt-in now; only mention it once it has actually been used. */}
        {lastSync && <span className="text-xs text-[var(--text-tertiary)]">Band synced {formatRelativeTime(new Date(lastSync))}</span>}
      </div>
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
