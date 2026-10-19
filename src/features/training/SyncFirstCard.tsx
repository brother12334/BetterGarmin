import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useData } from '../../app/DataProvider'
import { formatRelativeTime } from '../../lib/relativeTime'

/**
 * Heart rate for an imported workout comes from Garmin, which only has it once the watch has synced. Asking for a
 * sync right at import time means the sets line up with heart rate straight away instead of showing empty panels.
 */
export function SyncFirstCard() {
  const { cloudConfigured, pullFromGarmin, garminPull, lastSynced, online, cloudStatus } = useData()
  if (!cloudConfigured) return null
  const running = garminPull.status === 'running'
  return (
    <Card className="flex flex-col gap-3 self-stretch border-sky-400/30">
      <div>
        <p className="font-semibold">Sync your watch first</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Heart rate for each set comes from Garmin, so it only shows once your watch has uploaded this workout. Tap <b>Sync now</b> (it opens Garmin
          Connect if you use the Shortcut), and the sets fill in with heart rate in about 2 minutes.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
        <span className={garminPull.status === 'error' ? 'text-rose-400' : undefined}>
          {running ? 'Syncing… about 2 minutes' : garminPull.status === 'error' ? garminPull.message : `Last synced ${formatRelativeTime(lastSynced)}`}
        </span>
        <Button loading={running} variant="secondary" onClick={() => pullFromGarmin()} disabled={!online || running || cloudStatus === 'syncing'} className="shrink-0">
          {running ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
    </Card>
  )
}
