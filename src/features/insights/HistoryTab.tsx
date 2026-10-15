import { useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Chart } from '../../components/ui/Chart'
import { InfoButton } from '../../components/ui/InfoButton'
import { addDays } from '../../lib/dateRange'
import type { AnalyticsDataset, DayRecord } from '../analytics/model'
import { mad, median } from '../analytics/robust'

const RANGES = [
  { label: '7d', days: 7 },
  { label: '28d', days: 28 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
]

interface Panel {
  key: string
  label: string
  unit: string
  color: string
  get: (d: DayRecord) => number | null
}

const PANELS: Panel[] = [
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', color: '#fb4a59', get: (d) => d.restingHr },
  { key: 'hrv', label: 'HRV', unit: 'ms', color: '#34d399', get: (d) => d.hrv },
  { key: 'sleep', label: 'Sleep', unit: 'h', color: '#8b7bf6', get: (d) => (d.sleepMinutes != null ? Math.round((d.sleepMinutes / 60) * 10) / 10 : null) },
  { key: 'steps', label: 'Steps', unit: '', color: '#38bdf8', get: (d) => d.steps },
]

/** Trailing 28-day median ± 1.5 MAD, only where ≥14 earlier values exist. */
function baselineBand(days: DayRecord[], get: Panel['get']) {
  return days.map((_, i) => {
    const prior = days.slice(Math.max(0, i - 28), i).map(get).filter((v): v is number => v != null)
    if (prior.length < 14) return null
    const m = median(prior)!
    const s = mad(prior)!
    return { lo: m - 1.5 * s, hi: m + 1.5 * s, m }
  })
}

export function HistoryTab({ dataset }: { dataset: AnalyticsDataset }) {
  const [rangeDays, setRangeDays] = useState(90)
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null)
  const navigate = useNavigate()

  const from = custom?.from ?? addDays(dataset.lastDay, -(rangeDays - 1))
  const to = custom?.to ?? dataset.lastDay

  const { option, workoutsInRange } = useMemo(() => {
    const visible = dataset.days.filter((d) => d.day >= from && d.day <= to)
    // Baselines are computed on the full history so the first days of a short range still have one.
    const idx = new Map(dataset.days.map((d, i) => [d.day, i]))
    const panelCount = PANELS.length + 1
    const gap = 6
    const h = (100 - 6 - gap * panelCount) / panelCount
    const grids = Array.from({ length: panelCount }, (_, i) => ({ left: 44, right: 12, top: `${4 + i * (h + gap)}%`, height: `${h}%` }))
    const x = (d: string) => `${d}T00:00:00`

    const series: object[] = []
    const yAxes: object[] = []
    const xAxes: object[] = []
    PANELS.forEach((p, i) => {
      const band = baselineBand(dataset.days, p.get)
      const vis = visible.map((d) => ({ d, b: band[idx.get(d.day)!] }))
      xAxes.push({ type: 'time', gridIndex: i, min: x(from), max: x(to), axisLabel: { show: false }, axisLine: { lineStyle: { color: 'var(--border-panel)' } } })
      yAxes.push({ type: 'value', gridIndex: i, scale: true, name: `${p.label}${p.unit ? ` (${p.unit})` : ''}`, nameGap: 6, nameTextStyle: { color: 'var(--text-tertiary)', align: 'left', padding: [0, 0, 0, -40] }, splitNumber: 2, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)', fontSize: 10 } })
      series.push(
        { name: `${p.label} band low`, type: 'line', xAxisIndex: i, yAxisIndex: i, stack: `band${i}`, data: vis.map(({ d, b }) => [x(d.day), b ? b.lo : null]), showSymbol: false, lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
        { name: `${p.label} usual range`, type: 'line', xAxisIndex: i, yAxisIndex: i, stack: `band${i}`, data: vis.map(({ d, b }) => [x(d.day), b ? b.hi - b.lo : null]), showSymbol: false, lineStyle: { opacity: 0 }, areaStyle: { color: `${p.color}22` }, silent: true, tooltip: { show: false } },
        { name: p.label, type: 'line', xAxisIndex: i, yAxisIndex: i, data: visible.map((d) => [x(d.day), p.get(d)]), connectNulls: false, showSymbol: rangeDays <= 28, symbolSize: 4, lineStyle: { color: p.color, width: 1.5 }, itemStyle: { color: p.color } },
      )
    })

    const workoutsInRange = dataset.sessions.filter((s) => s.day >= from && s.day <= to)
    const vi = PANELS.length
    xAxes.push({ type: 'time', gridIndex: vi, min: x(from), max: x(to), splitNumber: 3, axisLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)', hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } })
    yAxes.push({ type: 'value', gridIndex: vi, name: 'Volume (t)', nameGap: 6, nameTextStyle: { color: 'var(--text-tertiary)', align: 'left', padding: [0, 0, 0, -40] }, splitNumber: 2, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)', fontSize: 10 } })
    series.push({
      name: 'Strength volume',
      type: 'bar',
      xAxisIndex: vi,
      yAxisIndex: vi,
      barMaxWidth: 10,
      data: workoutsInRange.map((s) => ({ value: [x(s.day), Math.round(s.volumeKg / 100) / 10], workoutId: s.workoutId, timed: s.timed, title: s.title })),
      itemStyle: { color: '#a78bfa', borderRadius: [3, 3, 0, 0] },
    })

    return {
      workoutsInRange,
      option: {
        grid: grids,
        xAxis: xAxes,
        yAxis: yAxes,
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        tooltip: {
          trigger: 'axis' as const,
          valueFormatter: (v: unknown) => (v == null ? 'no data' : String(v)),
        },
        dataZoom: [{ type: 'inside', xAxisIndex: PANELS.map((_, i) => i).concat(vi) }],
        series,
      } as EChartsOption,
    }
  }, [dataset, from, to, rangeDays])

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold">Physiological history</p>
            <InfoButton title="History">
              Each metric has its own panel and scale on a shared time axis — lines moving together is not evidence that they're related
              (see Findings for analyses that test that). The shaded band is your usual range: the median of the previous 28 days ± 1.5 MAD,
              drawn only once 14 days of history exist. Gaps are days with no data. Tap a volume bar to open that workout.
            </InfoButton>
          </div>
          <div className="flex gap-1 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => {
                  setCustom(null)
                  setRangeDays(r.days)
                }}
                className={`rounded-full px-2.5 py-1 ${!custom && rangeDays === r.days ? 'bg-sky-500/20 text-sky-400' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <span>Custom:</span>
          <input type="date" value={from} min={dataset.firstDay} max={to} onChange={(e) => e.target.value && setCustom({ from: e.target.value, to })} className="rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1 text-[var(--text-primary)]" />
          <span>to</span>
          <input type="date" value={to} min={from} max={dataset.lastDay} onChange={(e) => e.target.value && setCustom({ from, to: e.target.value })} className="rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1 text-[var(--text-primary)]" />
        </div>
        <Chart
          option={option}
          height={560}
          onClick={(params) => {
            const d = params.data as { workoutId?: string; timed?: boolean } | undefined
            if (d?.workoutId) navigate(d.timed ? `/training/strength/workout/${d.workoutId}` : '/training/strength')
          }}
        />
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          {workoutsInRange.length} logged strength session{workoutsInRange.length === 1 ? '' : 's'} in this period.
        </p>
      </Card>
    </div>
  )
}
