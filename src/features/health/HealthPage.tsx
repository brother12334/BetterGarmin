import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Chart } from '../../components/ui/Chart'
import { InfoButton } from '../../components/ui/InfoButton'
import { Skeleton } from '../../components/ui/Skeleton'
import { useData } from '../../app/DataProvider'
import {
  getLatestDay,
  getMonitoringHrForDay,
  getMonitoringPulseOxForDay,
  getRestingHrRange,
  getStressForDay,
  getWeightRange,
} from '../../db/queries'
import { addDays } from '../../lib/dateRange'
import { computeBaseline, zScore, type Baseline } from '../../scores/baselines'
import { METRIC_COLORS } from '../../components/ui/metricColors'

const WINDOW_DAYS = 90

interface HealthData {
  day: string
  restingHrSeries: { day: string; resting_heart_rate: number | null }[]
  allDayHr: { timestamp: string; heart_rate: number | null }[]
  stressToday: { timestamp: string; stress: number | null }[]
  weightSeries: { day: string; weight: number | null }[]
  spo2Today: { timestamp: string; pulse_ox: number | null }[]
  restingHrBaseline: Baseline | null
}

function timeAxisOption() {
  return {
    type: 'time' as const,
    splitNumber: 4,
    axisLine: { lineStyle: { color: 'var(--border-panel)' } },
    axisLabel: {
      color: 'var(--text-tertiary)',
      hideOverlap: true,
      formatter: (v: number) => new Date(v).toLocaleTimeString(undefined, { hour: 'numeric' }),
    },
  }
}

function dayAxisOption() {
  return {
    type: 'time' as const,
    splitNumber: 4,
    axisLine: { lineStyle: { color: 'var(--border-panel)' } },
    axisLabel: {
      color: 'var(--text-tertiary)',
      hideOverlap: true,
      formatter: (v: number) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    },
  }
}

export function HealthPage() {
  const { loadedKinds, lastSynced } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const hasMonitoring = loadedKinds.includes('monitoring')
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!hasGarmin) {
        if (!cancelled) {
          setData(null)
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const day = await getLatestDay()
      if (!day) {
        if (!cancelled) {
          setData(null)
          setLoading(false)
        }
        return
      }
      const startDay = addDays(day, -WINDOW_DAYS)
      const [restingHrSeries, weightSeries, stressToday, allDayHr, spo2Today] = await Promise.all([
        getRestingHrRange(startDay, day),
        getWeightRange(startDay, day),
        getStressForDay(day),
        hasMonitoring ? getMonitoringHrForDay(day) : Promise.resolve([]),
        hasMonitoring ? getMonitoringPulseOxForDay(day) : Promise.resolve([]),
      ])
      if (cancelled) return

      const rhrValues = restingHrSeries.map((r) => r.resting_heart_rate).filter((v): v is number => v != null)
      const restingHrBaseline = computeBaseline(rhrValues)

      setData({ day, restingHrSeries, allDayHr, stressToday, weightSeries, spo2Today, restingHrBaseline })
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasGarmin, hasMonitoring, lastSynced])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Health</h1>
        <Card className="text-center text-[var(--text-secondary)]">No data loaded yet.</Card>
      </div>
    )
  }

  const todayRhr = data.restingHrSeries.find((r) => r.day === data.day)?.resting_heart_rate ?? null
  const weightValues = data.weightSeries.map((w) => w.weight).filter((v): v is number => v != null)
  const hasWeight = weightValues.length > 0

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Health</h1>

      <Card>
        <div className="mb-1 flex items-center gap-1.5">
          <p className="font-semibold">Resting heart rate</p>
          <InfoButton title="Resting heart rate">
            Your heart rate at rest, usually measured overnight. Trending down over weeks/months is generally a
            sign of improving cardiovascular fitness.
          </InfoButton>
        </div>
        {data.restingHrBaseline && todayRhr != null && (
          <p className="mb-2 text-sm text-[var(--text-secondary)]">
            Today: <span className="font-semibold text-[var(--text-primary)]">{todayRhr} bpm</span> · your{' '}
            {WINDOW_DAYS}-day average is {Math.round(data.restingHrBaseline.mean)} bpm
            {Math.abs(zScore(todayRhr, data.restingHrBaseline)) >= 1.5 ? ' — an unusual day' : ''}
          </p>
        )}
        <Chart
          option={{
            xAxis: dayAxisOption(),
            yAxis: { type: 'value', splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
            series: [
              {
                type: 'line',
                data: data.restingHrSeries
                  .filter((r) => r.resting_heart_rate != null)
                  .map((r) => [`${r.day}T00:00:00`, r.resting_heart_rate]),
                smooth: true,
                symbol: 'none',
                lineStyle: { color: METRIC_COLORS.heart.solid, width: 2 },
                areaStyle: { color: 'rgba(251, 74, 89, 0.08)' },
              },
            ],
          }}
        />
      </Card>

      {hasMonitoring && data.allDayHr.length > 0 && (
        <Card>
          <p className="mb-2 font-semibold">All-day heart rate</p>
          <Chart
            option={{
              xAxis: timeAxisOption(),
              yAxis: { type: 'value', splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
              series: [
                {
                  type: 'line',
                  data: data.allDayHr
                    .filter((h) => h.heart_rate != null)
                    .map((h) => [h.timestamp.replace(' ', 'T'), h.heart_rate]),
                  symbol: 'none',
                  lineStyle: { color: METRIC_COLORS.heart.solid, width: 1.5 },
                },
              ],
            }}
          />
        </Card>
      )}

      {data.stressToday.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center gap-1.5">
            <p className="font-semibold">Stress today</p>
            <InfoButton title="Stress">
              A 0-100 estimate from your heart-rate variability relative to resting heart rate. Below 25 is calm,
              25-50 is typical daily stress, 50-75 is medium, above 75 is high.
            </InfoButton>
          </div>
          <Chart
            option={{
              xAxis: timeAxisOption(),
              yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
              series: [
                {
                  type: 'line',
                  data: data.stressToday
                    .filter((s) => s.stress != null && s.stress >= 0)
                    .map((s) => [s.timestamp.replace(' ', 'T'), s.stress]),
                  symbol: 'none',
                  lineStyle: { color: METRIC_COLORS.stress.solid, width: 1.5 },
                  areaStyle: { color: 'rgba(245, 166, 35, 0.1)' },
                },
              ],
            }}
          />
        </Card>
      )}

      {hasWeight && (
        <Card>
          <p className="mb-2 font-semibold">Weight</p>
          <Chart
            option={{
              xAxis: dayAxisOption(),
              yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
              series: [
                {
                  type: 'line',
                  data: data.weightSeries
                    .filter((w) => w.weight != null)
                    .map((w) => [`${w.day}T00:00:00`, w.weight]),
                  smooth: true,
                  symbol: 'circle',
                  symbolSize: 5,
                  lineStyle: { color: '#8b7bf6', width: 2 },
                },
              ],
            }}
          />
        </Card>
      )}

      {hasMonitoring && data.spo2Today.length > 0 && (
        <Card>
          <p className="mb-2 font-semibold">Blood oxygen (SpO2)</p>
          <Chart
            option={{
              xAxis: timeAxisOption(),
              yAxis: { type: 'value', min: 85, max: 100, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
              series: [
                {
                  type: 'line',
                  data: data.spo2Today
                    .filter((s) => s.pulse_ox != null)
                    .map((s) => [s.timestamp.replace(' ', 'T'), s.pulse_ox]),
                  symbol: 'none',
                  lineStyle: { color: '#38bdf8', width: 1.5 },
                },
              ],
            }}
            height={160}
          />
        </Card>
      )}
    </div>
  )
}
