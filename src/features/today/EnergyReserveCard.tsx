import { Card } from '../../components/ui/Card'
import { InfoButton } from '../../components/ui/InfoButton'
import { Chart } from '../../components/ui/Chart'
import type { EnergyPoint, EnergySegment } from '../../scores/energyReserve'
import { formatHour, formatTime as formatClockTime } from '../../lib/clock'

function formatTime(ts: string): string {
  return formatClockTime(new Date(ts.replace(' ', 'T')))
}

export function EnergyReserveCard({
  curve,
  biggestDrain,
  bestRecharge,
}: {
  curve: EnergyPoint[]
  biggestDrain: EnergySegment | null
  bestRecharge: EnergySegment | null
}) {
  if (curve.length < 2) return null

  const option = {
    xAxis: {
      type: 'time' as const,
      splitNumber: 4,
      axisLine: { lineStyle: { color: 'var(--border-panel)' } },
      axisLabel: { color: 'var(--text-tertiary)', formatter: formatHour, hideOverlap: true },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: 'var(--border-panel)' } },
      axisLabel: { color: 'var(--text-tertiary)' },
    },
    series: [
      {
        type: 'line' as const,
        data: curve.map((p) => [p.timestamp.replace(' ', 'T'), p.value]),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#34d399', width: 2 },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(52, 211, 153, 0.35)' },
              { offset: 1, color: 'rgba(56, 189, 248, 0.02)' },
            ],
          },
        },
      },
    ],
  }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <p className="font-semibold">Energy Reserve</p>
        <InfoButton title="Energy Reserve">
          BetterGarmin's own estimate of your energy reserves across the day, from your stress samples. Not
          Garmin's Body Battery — see docs/scores/energy-reserve.md for the formula.
        </InfoButton>
      </div>
      <Chart option={option} height={180} />
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
        {biggestDrain && (
          <div className="rounded-control bg-[var(--bg-panel)] p-3">
            <p className="font-medium text-rose-400">Biggest drain</p>
            <p className="mt-1 text-[var(--text-secondary)]">
              {formatTime(biggestDrain.startTimestamp)} – {formatTime(biggestDrain.endTimestamp)} ·{' '}
              {Math.round(biggestDrain.delta)} pts
            </p>
          </div>
        )}
        {bestRecharge && (
          <div className="rounded-control bg-[var(--bg-panel)] p-3">
            <p className="font-medium text-emerald-400">Best recharge</p>
            <p className="mt-1 text-[var(--text-secondary)]">
              {formatTime(bestRecharge.startTimestamp)} – {formatTime(bestRecharge.endTimestamp)} · +
              {Math.round(bestRecharge.delta)} pts
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
