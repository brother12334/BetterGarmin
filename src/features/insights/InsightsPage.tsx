import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Chart } from '../../components/ui/Chart'
import { Skeleton } from '../../components/ui/Skeleton'
import { InfoButton } from '../../components/ui/InfoButton'
import { useInsightsData, METRIC_OPTIONS, type DailyMetrics } from './useInsightsData'
import { movingAverage, pearsonCorrelation } from '../../lib/stats'
import { useUnits } from '../../app/units'
import { convertDistance, convertWeight, distanceUnitLabel, weightUnitLabel, type UnitSystem } from '../../lib/units'
import { useAnalytics } from '../analytics/useAnalytics'
import { FindingsTab } from './FindingsTab'
import { HistoryTab } from './HistoryTab'
import { ExperimentsCard } from './ExperimentsCard'
import { AskTab } from './AskTab'
import { BigStat, Dial } from '../../components/charts/HealthCharts'
import { zoom, type Point } from '../../components/charts/chartKit'

const TABS = [
  { key: 'findings', label: 'Findings' },
  { key: 'history', label: 'History' },
  { key: 'explore', label: 'Explore' },
  { key: 'ask', label: 'Ask' },
] as const
type TabKey = (typeof TABS)[number]['key']

type MetricKey = (typeof METRIC_OPTIONS)[number]['key']

function convertMetric(key: MetricKey, value: number | null, units: UnitSystem): number | null {
  if (value == null) return null
  if (key === 'distance') return convertDistance(value, units)
  if (key === 'weight') return convertWeight(value, units)
  return value
}

function metricUnit(key: MetricKey, units: UnitSystem): string {
  if (key === 'distance') return distanceUnitLabel(units)
  if (key === 'weight') return weightUnitLabel(units)
  return METRIC_OPTIONS.find((o) => o.key === key)!.unit
}

function dayAxis() {
  return {
    type: 'time' as const,
    splitNumber: 3,
    axisLine: { lineStyle: { color: 'var(--border-panel)' } },
    axisLabel: { color: 'var(--text-tertiary)', hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) },
  }
}

export function InsightsPage() {
  const { data, loading } = useInsightsData(180)
  const analytics = useAnalytics()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'findings') as TabKey

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Insights</h1>
      <div className="sticky top-0 z-10 -mx-1 flex gap-1 rounded-2xl bg-[var(--bg-base)]/80 p-1 backdrop-blur" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-[var(--bg-panel)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {analytics.error && <Card className="text-sm text-rose-400">Analysis failed: {analytics.error}</Card>}

      {(loading || analytics.loading) && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {analytics.result && tab === 'findings' && (
        <>
          {data.length > 0 && <WeeklyRecap data={data} />}
          <FindingsTab findings={analytics.result.findings} recovery={analytics.result.recovery} />
        </>
      )}
      {analytics.result && tab === 'history' && <HistoryTab dataset={analytics.result.dataset} />}
      {analytics.result && tab === 'explore' && (
        <>
          <ExperimentsCard dataset={analytics.result.dataset} />
          {data.length > 0 && <TrendExplorer data={data} />}
          {data.length > 0 && <CorrelationExplorer data={data} />}
        </>
      )}
      {analytics.result && tab === 'ask' && <AskTab result={analytics.result} />}
    </div>
  )
}

function WeeklyRecap({ data }: { data: DailyMetrics[] }) {
  const lastWeek = data.slice(-7)
  const avg = (key: MetricKey) => {
    const vals = lastWeek.map((d) => d[key]).filter((v): v is number => v != null)
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }
  const trend = (key: MetricKey): Point[] =>
    data.slice(-28).flatMap((d) => (d[key] == null ? [] : [[new Date(`${d.day}T00:00:00`).getTime(), d[key] as number] as Point]))
  const totalSteps = lastWeek.reduce((s, d) => s + (d.steps ?? 0), 0)
  const sleepH = avg('sleepMinutes')
  const r = (v: number | null) => (v == null ? null : Math.round(v))

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Dial label="Avg sleep score" value={r(avg('sleepScore'))} color="#8b7bf6" caption="this week" />
        <Dial label="Avg stress" value={r(avg('stressAvg'))} color="#f5a623" caption="this week" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <BigStat label="Steps" value={totalSteps.toLocaleString()} sub="this week" color="#34d399" trend={trend('steps')} />
        <BigStat label="Resting HR" value={r(avg('restingHr'))} unit="bpm" sub="weekly average" color="#fb4a59" trend={trend('restingHr')} />
        <BigStat label="Sleep" value={sleepH == null ? null : `${Math.floor(sleepH / 60)}h ${Math.round(sleepH % 60)}m`} sub="nightly average" color="#8b7bf6" trend={trend('sleepMinutes')} />
        <BigStat label="Calories" value={r(avg('calories'))?.toLocaleString() ?? null} sub="daily average" color="#38bdf8" trend={trend('calories')} />
      </div>
    </>
  )
}

function TrendExplorer({ data }: { data: DailyMetrics[] }) {
  const { units } = useUnits()
  const [metric, setMetric] = useState<MetricKey>('steps')
  const option = METRIC_OPTIONS.find((o) => o.key === metric)!

  const raw = data.map((d) => convertMetric(metric, d[metric], units))
  const ma7 = movingAverage(raw, 7)
  const ma30 = movingAverage(raw, 30)
  const days = data.map((d) => `${d.day}T00:00:00`)

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold">Trends</p>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          className="rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1 text-sm text-[var(--text-primary)]"
        >
          {METRIC_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Chart
        option={{
          grid: { left: 8, right: 10, top: 30, bottom: 8, containLabel: true },
          dataZoom: zoom(),
          xAxis: dayAxis(),
          yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
          legend: { data: ['Daily', '7-day avg', '30-day avg'], textStyle: { color: 'var(--text-tertiary)' }, top: 0 },
          series: [
            { name: 'Daily', type: 'line', data: days.map((d, i) => [d, raw[i]]), symbol: 'none', lineStyle: { color: 'rgba(56,189,248,0.25)', width: 1 } },
            { name: '7-day avg', type: 'line', data: days.map((d, i) => [d, ma7[i]]), symbol: 'none', smooth: true, lineStyle: { color: '#38bdf8', width: 2 } },
            { name: '30-day avg', type: 'line', data: days.map((d, i) => [d, ma30[i]]), symbol: 'none', smooth: true, lineStyle: { color: '#8b7bf6', width: 2 } },
          ],
        }}
      />
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
        {option.label}
        {metricUnit(metric, units) ? ` (${metricUnit(metric, units)})` : ''}
      </p>
    </Card>
  )
}

function CorrelationExplorer({ data }: { data: DailyMetrics[] }) {
  const { units } = useUnits()
  const [metricA, setMetricA] = useState<MetricKey>('sleepMinutes')
  const [metricB, setMetricB] = useState<MetricKey>('restingHr')
  const [lag, setLag] = useState(1)

  const labelA = METRIC_OPTIONS.find((o) => o.key === metricA)!.label
  const labelB = METRIC_OPTIONS.find((o) => o.key === metricB)!.label

  const { points, correlation } = useMemo(() => {
    const pts: [number, number][] = []
    for (let i = 0; i < data.length - lag; i++) {
      const x = convertMetric(metricA, data[i][metricA], units)
      const y = convertMetric(metricB, data[i + lag][metricB], units)
      if (x != null && y != null) pts.push([x, y])
    }
    return { points: pts, correlation: pearsonCorrelation(pts) }
  }, [data, metricA, metricB, lag, units])

  return (
    <Card>
      <div className="mb-1 flex items-center gap-1.5">
        <p className="font-semibold">Correlation explorer</p>
        <InfoButton title="Correlation">
          Shows how two metrics move together across your history. A strong correlation doesn't prove one causes
          the other — lots of things vary together without a direct cause-and-effect link.
        </InfoButton>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <select value={metricA} onChange={(e) => setMetricA(e.target.value as MetricKey)} className="rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1">
          {METRIC_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-[var(--text-tertiary)]">vs.</span>
        <select value={metricB} onChange={(e) => setMetricB(e.target.value as MetricKey)} className="rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1">
          {METRIC_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={lag} onChange={(e) => setLag(Number(e.target.value))} className="rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1">
          <option value={0}>same day</option>
          <option value={1}>next day</option>
          <option value={2}>2 days later</option>
          <option value={3}>3 days later</option>
        </select>
      </div>

      <Chart
        option={{
          dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'inside', yAxisIndex: 0 }],
          xAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
          yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
          series: [{ type: 'scatter', data: points, symbolSize: 7, itemStyle: { color: 'rgba(56,189,248,0.7)' } }],
        }}
        height={220}
      />

      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        {correlation
          ? `${labelA} and ${labelB} (${lag === 0 ? 'same day' : `${lag}d later`}) show ${
              correlation.direction === 'none'
                ? 'no meaningful correlation'
                : `a ${correlation.strength} ${correlation.direction} correlation`
            } (r = ${correlation.r.toFixed(2)}, n = ${correlation.n}). Correlation isn't causation.`
          : 'Not enough overlapping data yet for these two metrics.'}
      </p>
    </Card>
  )
}
