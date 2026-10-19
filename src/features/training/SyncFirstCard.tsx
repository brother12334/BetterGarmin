import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useData } from '../../app/DataProvider'
import { formatRelativeTime } from '../../lib/relativeTime'

/**
 * Heart rate for an imported workout only exists here once the band has synced. Asking for a
 * sync right at import time means the sets line up with heart rate straight away instead of showing empty panels.
 */
export function SyncFirstCard() {
  const { pullFromGarmin, garminPull, lastSynced, cloudStatus } = useData()
  const running = garminPull.status === 'running'
  return (
    <Card className="flex flex-col gap-3 self-stretch border-sky-400/30">
      <div>
        <p className="font-semibold">Sync your watch first</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Heart rate for each set comes from your band, so it only shows once the band has synced this workout. Tap <b>Sync now</b> to pull it
          straight from the band over Bluetooth.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
        <span className={garminPull.status === 'error' ? 'text-rose-400' : undefined}>
          {running ? 'Syncing…' : garminPull.status === 'error' ? garminPull.message : (garminPull.note ?? `Last synced ${formatRelativeTime(lastSynced)}`)}
        </span>
        <Button loading={running} variant="secondary" onClick={() => pullFromGarmin()} disabled={running || cloudStatus === 'syncing'} className="shrink-0">
          {running ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
    </Card>
  )
}
