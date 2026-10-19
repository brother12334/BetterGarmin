import { Button } from '../../components/ui/Button'
import { useData } from '../../app/DataProvider'
import type { SaveStatus as Status } from './useWorkoutHistory'

const Step = ({ done, label }: { done: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-1 text-xs ${done ? 'text-emerald-500' : 'text-[var(--text-tertiary)]'}`}>
    <span aria-hidden>{done ? '✓' : '○'}</span>
    {label}
  </span>
)

/** The three separate confirmations for a band workout, plus a retry when the download hasn't happened. */
export function SaveStatus({ status, compact = false }: { status: Status; compact?: boolean }) {
  const { pullFromGarmin, garminPull } = useData()
  const running = garminPull.status === 'running'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Save status">
        <Step done={status.onBand} label="Saved on band" />
        <Step done={status.downloaded} label="Downloaded" />
        <Step done={status.inHistory} label="Added to history" />
      </div>
      {!status.downloaded && !compact && (
        <div className="flex flex-col gap-2 rounded-control border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p>
            {status.lastError ? `The download didn't finish: ${status.lastError}. ` : "This workout hasn't been downloaded yet. "}
            The recording is still safe on your band, and nothing is deleted from it.
          </p>
          <Button variant="secondary" loading={running} disabled={running} onClick={() => pullFromGarmin({ bandOnly: true })} className="self-start">
            Retry download
          </Button>
        </div>
      )}
    </div>
  )
}
