import { METRIC_COLORS } from '../../components/ui/metricColors'
import { Hl } from '../../components/charts/HealthCharts'
import { rgba } from '../../components/charts/chartKit'
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

  const ink = METRIC_COLORS.energy.blockInk
  const last = curve[curve.length - 1]
  const option = {
    grid: { left: 4, right: 4, top: 8, bottom: 4, containLabel: true },
    xAxis: {
      type: 'time' as const,
      minInterval: 2 * 3600_000,
      maxInterval: 2 * 3600_000,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      // Only 6a/12p/6p: full times collided on a phone.
      axisLabel: {
        color: rgba(ink, 0.65),
        fontWeight: 700,
        fontSize: 11,
        formatter: (v: number) => ([6, 12, 18].includes(new Date(v).getHours()) && new Date(v).getMinutes() === 0 ? formatHour(v) : ''),
        hideOverlap: true,
      },
    },
    yAxis: { type: 'value' as const, min: 0, max: 100, show: false },
    series: [
      {
        type: 'line' as const,
        data: curve.map((p) => [p.timestamp.replace(' ', 'T'), p.value]),
        smooth: true,
        symbol: 'none',
        // A heavy lime line over a faint lime fill, on the energy block's black.
        lineStyle: { color: ink, width: 3 },
        areaStyle: { color: rgba(ink, 0.16) },
      },
    ],
  }

  return (
    <div className="metric-block p-4" style={{ ['--block' as string]: METRIC_COLORS.energy.block, ['--block-ink' as string]: ink }}>
      <div className="flex items-center gap-2">
        <p className="blk-label text-sm opacity-80">Energy Reserve</p>
        <InfoButton title="Energy Reserve">
          BetterGarmin's own estimate of your energy reserves across the day, from your stress samples. Not
          Garmin's Body Battery — see docs/scores/energy-reserve.md for the formula.
        </InfoButton>
      </div>
      <p className="mt-1.5 text-[1.375rem] font-extrabold leading-tight tracking-tight">
        At <Hl>{Math.round(last.value)}</Hl> now
        {biggestDrain ? `, biggest drop ${Math.round(biggestDrain.delta)} at ${formatTime(biggestDrain.startTimestamp)}` : ''}
        {bestRecharge ? `, best recharge +${Math.round(bestRecharge.delta)}` : ''}.
      </p>
      <div className="mt-2">
        <Chart option={option} height={150} />
      </div>
    </div>
  )
}
