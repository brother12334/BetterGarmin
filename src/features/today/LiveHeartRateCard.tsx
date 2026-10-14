import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { HealthIcon } from '../../app/icons'
import { useLiveHeartRate } from './useLiveHeartRate'

const SPARK_WIDTH = 220
const SPARK_HEIGHT = 44

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div style={{ width: SPARK_WIDTH, height: SPARK_HEIGHT }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * SPARK_WIDTH
      const y = SPARK_HEIGHT - ((v - min) / range) * (SPARK_HEIGHT - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}>
      <polyline points={points} fill="none" stroke="#fb4a59" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LiveHeartRateCard() {
  const { status, bpm, history, deviceName, error, connect, disconnect } = useLiveHeartRate()

  if (status === 'unsupported') {
    return (
      <Card className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400">
          <HealthIcon width={22} height={22} />
        </div>
        <div>
          <p className="font-semibold">Live heart rate</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Needs a browser with Web Bluetooth (Chrome or Edge, desktop or Android). Not available in Safari or iOS.
          </p>
        </div>
      </Card>
    )
  }

  if (status === 'connected') {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              key={history.length}
              initial={{ scale: 0.72 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 9 }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400"
            >
              <HealthIcon width={22} height={22} />
            </motion.div>
            <div>
              <p className="text-xs font-medium text-[var(--text-tertiary)]">Live heart rate · {deviceName}</p>
              <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">
                {bpm ?? '—'} <span className="text-base font-medium text-[var(--text-tertiary)]">bpm</span>
              </p>
            </div>
          </div>
          <Sparkline values={history.map((h) => h.bpm)} />
        </div>
        <Button variant="ghost" className="mt-3" onClick={disconnect}>
          Disconnect
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex items-center justify-between gap-4">
      <div>
        <p className="font-semibold">Live heart rate</p>
        <p className="text-sm text-[var(--text-secondary)]">
          Connects straight to your watch over Bluetooth — turn on <strong>Broadcast Heart Rate</strong> in its
          sensor settings first.
        </p>
        {error && <p className="mt-1 text-sm text-rose-400">{error}</p>}
      </div>
      <Button onClick={connect} disabled={status === 'connecting'}>
        {status === 'connecting' ? 'Connecting…' : 'Connect'}
      </Button>
    </Card>
  )
}
