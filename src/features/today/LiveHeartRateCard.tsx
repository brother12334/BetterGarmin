import { useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { HealthIcon } from '../../app/icons'
import { useLiveHeartRate } from './useLiveHeartRate'
import { useLatestHeartRate } from './useLatestHeartRate'
import { formatRelativeTime } from '../../lib/relativeTime'

export function LiveHeartRateCard() {
  const live = useLiveHeartRate()
  const latest = useLatestHeartRate()

  // True live Bluetooth stream takes over the whole card when connected.
  if (live.status === 'connected') {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400"
            >
              <HealthIcon width={22} height={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-tertiary)]">Live heart rate · {live.deviceName}</p>
              <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">
                {live.bpm ?? '—'} <span className="text-base font-medium text-[var(--text-tertiary)]">bpm</span>
              </p>
            </div>
          </div>
        </div>
        <Button variant="ghost" className="mt-3" onClick={live.disconnect}>
          Disconnect
        </Button>
      </Card>
    )
  }

  return (
    <Card>
      <LatestReading latest={latest} />

      {live.status === 'unsupported' ? (
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
          For live, second-by-second updates instead of a refreshed reading, your browser needs Web Bluetooth
          (Chrome or Edge) — not available in Safari or iOS.
        </p>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-panel)] pt-3">
          <p className="text-xs text-[var(--text-tertiary)]">
            Or connect your watch directly for live, second-by-second updates — turn on{' '}
            <strong>Broadcast Heart Rate</strong> in its sensor settings first.
          </p>
          <Button variant="secondary" onClick={live.connect} disabled={live.status === 'connecting'} className="shrink-0">
            {live.status === 'connecting' ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      )}
      {live.error && <p className="mt-2 text-sm text-rose-400">{live.error}</p>}
    </Card>
  )
}

function LatestReading({ latest }: { latest: ReturnType<typeof useLatestHeartRate> }) {
  // latest.clock isn't read here — it's a deliberate dependency so this label
  // keeps ticking up ("4m ago" -> "5m ago") even when the reading itself hasn't changed.
  const relative = useMemo(
    () => formatRelativeTime(latest.reading ? new Date(latest.reading.timestamp.replace(' ', 'T')) : null),
    [latest.reading, latest.clock],
  )

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <HealthIcon width={22} height={22} />
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)]">
            Heart rate {latest.reading ? `· ${relative}` : ''}
          </p>
          <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">
            {latest.reading ? latest.reading.heart_rate : '—'}{' '}
            <span className="text-base font-medium text-[var(--text-tertiary)]">bpm</span>
          </p>
        </div>
      </div>
      <Button variant="secondary" onClick={latest.refresh} disabled={latest.loading}>
        {latest.loading ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
  )
}
