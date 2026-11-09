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
      minInterval: 2 * 3600_000,
      maxInterval: 2 * 3600_000,
      axisLine: { lineStyle: { color: 'var(--border-panel)' } },
      axisLabel: { color: 'var(--text-tertiary)', // Only 6a/12p/6p: full times collided on a phone.
        formatter: (v: number) => ([6, 12, 18].includes(new Date(v).getHours()) && new Date(v).getMinutes() === 0 ? formatHour(v) : ''),
        hideOverlap: true },
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
        // Drawn as a hike's elevation profile: an inked ridge line over solid terrain, with a "you are here" post.
        lineStyle: { color: 'var(--text-primary)', width: 2 },
        // Earth under the ridge line, like the shaded ground of a trail profile.
        areaStyle: { color: '#6b4a2b', opacity: 0.16 },
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: 'var(--text-primary)', type: 'solid' as const, width: 1 },
          label: { formatter: 'YOU ARE HERE', position: 'end' as const, rotate: 0, align: 'right' as const, color: 'var(--text-primary)', fontWeight: 800, fontSize: 10 },
          data: [{ xAxis: curve[curve.length - 1].timestamp.replace(' ', 'T') }],
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
      {/* Waypoints of the day as signpost rows, not tiles. */}
      <div className="mt-2 divide-y divide-[var(--border-panel)] border-t border-[var(--border-panel)] text-sm">
        {biggestDrain && (
          <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="sign-caps text-xs text-[var(--tone-red)]">Biggest drain</span>
            <span className="text-[var(--text-secondary)]">
              {formatTime(biggestDrain.startTimestamp)}–{formatTime(biggestDrain.endTimestamp)}
            </span>
            <span className="font-extrabold">{Math.round(biggestDrain.delta)}</span>
          </div>
        )}
        {bestRecharge && (
          <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="sign-caps text-xs text-[var(--tone-green)]">Best recharge</span>
            <span className="text-[var(--text-secondary)]">
              {formatTime(bestRecharge.startTimestamp)}–{formatTime(bestRecharge.endTimestamp)}
            </span>
            <span className="font-extrabold">+{Math.round(bestRecharge.delta)}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
