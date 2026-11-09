import { Link } from 'react-router-dom'
import { METRIC_COLORS } from '../../components/ui/metricColors'
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
    // Training's sunflower block: the latest session named big.
    <div className="metric-block flex flex-col gap-1 p-4" style={{ ['--block' as string]: METRIC_COLORS.training.block, ['--block-ink' as string]: METRIC_COLORS.training.blockInk }}>
      <div className="flex items-baseline justify-between">
        <p className="blk-label text-sm">Training</p>
        {/* Direct band sync is opt-in now; only mention it once it has actually been used. */}
        {lastSync && <span className="text-xs text-[var(--text-tertiary)]">Band synced {formatRelativeTime(new Date(lastSync))}</span>}
      </div>
      {latest && (
        <Link to={latest.kind === 'band' ? `/training/history/${encodeURIComponent(latest.id)}` : latest.kind === 'log' ? `/training/strength/workout/${latest.workout.id}` : '/training/history'} className="flex flex-col gap-1">
          <span className="blk-num text-[2.25rem]">{latest.title}</span>
          <span className="text-[0.8125rem] font-semibold opacity-80">
            Latest session{latest.at ? ` · ${new Date(latest.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
          </span>
          {latest.kind !== 'log' && <SaveStatus status={latest.status} compact />}
        </Link>
      )}
    </div>
  )
}
