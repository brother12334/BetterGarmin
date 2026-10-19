import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { BigStat, ClockRing, DetailChart, Dial } from '../../components/charts/HealthCharts'
import { GLASS_SLIDER, detailGrid, fade, rgba, timeAxis, valueAxis, zoom, type Point } from '../../components/charts/chartKit'
import { METRIC_COLORS } from '../../components/ui/metricColors'
import { useData } from '../../app/DataProvider'
import { useUnits } from '../../app/units'
import { convertWeight, weightUnitLabel } from '../../lib/units'
import {
  getDailySummaryRange,
  getHrvRange,
  getLatestDay,
  getMonitoringHrForDay,
  getMonitoringPulseOxForDay,
  getRestingHrRange,
  getStressForDay,
  getWeightRange,
} from '../../db/queries'
import type { DailySummaryRow, HrvRow } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { computeBaseline, type Baseline } from '../../scores/baselines'
import { parseGarminTimestamp } from '../training/matchGarminActivity'

const WINDOW_DAYS = 90
const TREND_DAYS = 14
const HEART = METRIC_COLORS.heart.solid
const STRESS = METRIC_COLORS.stress.solid
const ENERGY = METRIC_COLORS.energy.solid
const HRV = METRIC_COLORS.readiness.solid
const SPO2 = '#60a5fa'
const WEIGHT = METRIC_COLORS.neutral.solid

interface HealthData {
  day: string
  rhr: Point[]
  hrv: Point[]
  hrvRows: HrvRow[]
  summaries: DailySummaryRow[]
  weight: Point[]
  allDayHr: Point[]
  stress: Point[]
  spo2: Point[]
  rhrBaseline: Baseline | null
}

const dayMs = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00`).getTime()
const pts = <T,>(rows: T[], t: (r: T) => number | null, v: (r: T) => number | null): Point[] =>
  rows.flatMap((r) => {
    const x = t(r)
    const y = v(r)
    return x != null && y != null ? [[x, y] as Point] : []
  })
const last = (p: Point[]) => (p.length ? p[p.length - 1][1] : null)
const tail = (p: Point[], n = TREND_DAYS) => p.slice(-n)
const startPct = (n: number, show: number) => (n > show ? Math.round((1 - show / n) * 100) : 0)

export function HealthPage() {
  const { loadedKinds, lastSynced } = useData()
  const { units } = useUnits()
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
      const start = addDays(day, -WINDOW_DAYS)
      const [rhrRows, hrvRows, summaries, weightRows, stressRows, hrRows, spo2Rows] = await Promise.all([
        getRestingHrRange(start, day),
        getHrvRange(start, day),
        getDailySummaryRange(start, day),
        getWeightRange(start, day),
        getStressForDay(day),
        hasMonitoring ? getMonitoringHrForDay(day) : Promise.resolve([]),
        hasMonitoring ? getMonitoringPulseOxForDay(day) : Promise.resolve([]),
      ])
      if (cancelled) return
      const rhr = pts(rhrRows, (r) => dayMs(r.day), (r) => r.resting_heart_rate)
      setData({
        day,
        rhr,
        hrv: pts(hrvRows, (r) => dayMs(r.day), (r) => r.last_night_avg),
        hrvRows,
        summaries,
        weight: pts(weightRows, (r) => dayMs(r.day), (r) => (r.weight == null ? null : +convertWeight(r.weight, units).toFixed(1))),
        allDayHr: pts(hrRows, (r) => parseGarminTimestamp(r.timestamp), (r) => r.heart_rate),
        stress: pts(stressRows, (r) => parseGarminTimestamp(r.timestamp), (r) => (r.stress != null && r.stress >= 0 ? r.stress : null)),
        spo2: pts(spo2Rows, (r) => parseGarminTimestamp(r.timestamp), (r) => r.pulse_ox),
        rhrBaseline: computeBaseline(rhr.map((p) => p[1])),
      })
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasGarmin, hasMonitoring, lastSynced, units])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
        <Skeleton className="h-72 w-full" />
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

  const today = data.summaries.find((s) => s.day.slice(0, 10) === data.day.slice(0, 10)) ?? null
  const steps = pts(data.summaries, (s) => dayMs(s.day), (s) => s.steps)
  // Always show at least a week so a few days of data still reads as a proper chart, not two giant bars.
  const stepSlots: { t: number; v: number | null }[] = (() => {
    if (!steps.length) return []
    const byDay = new Map(steps.map(([t, v]) => [new Date(t).toDateString(), v]))
    const lastT = steps[steps.length - 1][0]
    const n = Math.max(7, Math.round((lastT - steps[0][0]) / 86_400_000) + 1)
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(lastT)
      d.setDate(d.getDate() - (n - 1 - i))
      return { t: d.getTime(), v: byDay.get(d.toDateString()) ?? null }
    })
  })()
  const showStepAvg = steps.length >= 3
  const stepGoal = today?.step_goal ?? null
  const hrvToday = data.hrvRows.at(-1)
  const perHour = [...Array(24).keys()].map((h) => {
    const v = data.allDayHr.filter(([t]) => new Date(t).getHours() === h).map(([, y]) => y)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  })
  const base = data.rhrBaseline
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Health</h1>

      {/* Dials: where you are right now. */}
      <div className="grid grid-cols-2 gap-3">
        <Dial label="Body Battery" value={today?.bb_max ?? null} color={ENERGY} caption={today?.bb_min != null ? `low ${today.bb_min}` : 'peak today'} />
        <Dial label="Stress" value={today?.stress_avg ?? null} color={STRESS} caption="average today" />
      </div>

      {hasMonitoring && data.allDayHr.length > 0 && (
        <ClockRing
          title="Heart rate around the clock"
          perHour={perHour}
          color={HEART}
          unit="bpm"
          highlightAbove={(base?.mean ?? 60) + 25}
          info="Your average heart rate for each hour of the day, arranged like a clock face with midnight at the top. Brighter bars are hours well above your resting heart rate."
        />
      )}

      {/* Big numbers. */}
      <div className="grid grid-cols-2 gap-3">
        <BigStat
          label="Resting HR"
          value={last(data.rhr)}
          unit="bpm"
          sub={base ? `normal ${Math.round(base.mean - base.stdDev)}–${Math.round(base.mean + base.stdDev)}` : undefined}
          color={HEART}
          trend={tail(data.rhr)}
          info="Your heart rate at rest, usually measured overnight. A lower number over weeks generally means better cardiovascular fitness."
        />
        <BigStat
          label="HRV"
          value={last(data.hrv)}
          unit="ms"
          sub={hrvToday?.status ? hrvToday.status.toLowerCase() : undefined}
          color={HRV}
          trend={tail(data.hrv)}
          info="Heart-rate variability overnight. Compare it with your own baseline rather than with other people."
        />
        <BigStat label="Steps" value={last(steps)?.toLocaleString() ?? null} sub={stepGoal ? `goal ${stepGoal.toLocaleString()}` : undefined} color={ENERGY} trend={tail(steps)} />
        <BigStat
          label="Blood oxygen"
          value={today?.spo2_avg ?? null}
          unit="%"
          sub={today?.spo2_min != null ? `lowest ${today.spo2_min}%` : undefined}
          color={SPO2}
          trend={tail(pts(data.summaries, (s) => dayMs(s.day), (s) => s.spo2_avg))}
        />
      </div>

      {/* Detail: zoomable charts. */}
      {data.allDayHr.length > 0 && (
        <DetailChart
          title="Heart rate today"
          option={{
            grid: detailGrid,
            dataZoom: zoom(),
            xAxis: timeAxis('hour'),
            yAxis: valueAxis({ scale: true }),
            series: [{ type: 'line', data: data.allDayHr, showSymbol: false, sampling: 'lttb', lineStyle: { color: HEART, width: 1.5 }, areaStyle: { color: fade(HEART, 0.25) } }],
          }}
        />
      )}

      {data.stress.length > 0 && (
        <DetailChart
          title="Stress today"
          info="A 0–100 estimate from heart-rate variability. Below 25 is rest, 26–50 low, 51–75 medium, above 75 high."
          option={{
            grid: detailGrid,
            dataZoom: zoom(),
            xAxis: timeAxis('hour'),
            yAxis: valueAxis({ min: 0, max: 100 }),
            series: [
              {
                type: 'bar',
                barWidth: '90%',
                data: data.stress.map(([t, v]) => ({ value: [t, v], itemStyle: { color: v > 50 ? STRESS : rgba(STRESS, 0.45) } })),
              },
            ],
          }}
        />
      )}

      {steps.length > 0 && (
        <DetailChart
          title="Steps"
          hint={showStepAvg ? 'line = 7-day average' : 'more days fill in as you sync'}
          option={{
            grid: { ...detailGrid, top: 34, right: 34, bottom: stepSlots.length > 21 ? 26 : 8 },
            legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: '#8a92a3', fontSize: 10 }, data: showStepAvg ? ['Steps', '7-day average'] : ['Steps'] },
            dataZoom:
              stepSlots.length > 21
                ? [{ type: 'inside', start: startPct(stepSlots.length, 21), end: 100, throttle: 0 }, { ...GLASS_SLIDER, start: startPct(stepSlots.length, 21), end: 100, bottom: 2, right: 46 }]
                : [],
            xAxis: {
              type: 'category',
              data: stepSlots.map(({ t }) => (stepSlots.length <= 7 ? new Date(t).toLocaleDateString(undefined, { weekday: 'short' }) : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))),
              axisLine: { lineStyle: { color: 'rgba(140,150,170,0.25)' } },
              axisTick: { show: false },
              axisLabel: { color: '#8a92a3', fontSize: 10, hideOverlap: true },
            },
            yAxis: valueAxis(),
            series: [
              {
                type: 'bar',
                name: 'Steps',
                color: ENERGY,
                barWidth: '58%',
                barMaxWidth: 34,
                showBackground: true,
                backgroundStyle: { color: 'rgba(140,150,170,0.08)', borderRadius: [6, 6, 0, 0] },
                label: { show: stepSlots.length <= 21, position: 'top', color: '#8a92a3', fontSize: 9, formatter: (p: unknown) => `${((p as { value: number }).value / 1000).toFixed(1)}k` },
                data: stepSlots.map(({ v }) => (v == null ? null : { value: v, itemStyle: { borderRadius: [6, 6, 0, 0], color: stepGoal && v >= stepGoal ? ENERGY : rgba(ENERGY, 0.55) } })),
                markLine: stepGoal
                  ? { silent: true, symbol: 'none', lineStyle: { color: ENERGY, type: 'dashed' }, label: { formatter: 'goal', position: 'end', color: ENERGY, fontSize: 10 }, data: [{ yAxis: stepGoal }] }
                  : undefined,
              },
              {
                type: 'line',
                name: '7-day average',
                color: '#e8eaf0',
                smooth: true,
                showSymbol: false,
                data: showStepAvg
                  ? stepSlots.map((_, i) => {
                      const win = stepSlots.slice(Math.max(0, i - 6), i + 1).filter((x) => x.v != null)
                      return win.length ? Math.round(win.reduce((sum, x) => sum + (x.v ?? 0), 0) / win.length) : null
                    })
                  : [],
                connectNulls: true,
                lineStyle: { color: '#e8eaf0', width: 3, shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.5)' },
                z: 5,
              },
            ],
          }}
        />
      )}

      {data.rhr.length > 1 && (
        <DetailChart
          title="Resting heart rate"
          hint="cooler = lower, warmer = higher"
          option={{
            grid: detailGrid,
            dataZoom: zoom(startPct(data.rhr.length, 30)),
            xAxis: timeAxis('day'),
            yAxis: valueAxis({ scale: true }),
            visualMap: base
              ? { show: false, dimension: 1, min: Math.round(base.mean - 2 * base.stdDev), max: Math.round(base.mean + 2 * base.stdDev), inRange: { color: ['#38bdf8', '#34d399', '#f5a623', HEART] } }
              : undefined,
            series: [{ type: 'line', data: data.rhr, smooth: true, showSymbol: false, lineStyle: { width: 3, color: base ? undefined : HEART }, areaStyle: { opacity: 0.2 } }],
          }}
        />
      )}

      {data.hrv.length > 1 && (
        <DetailChart
          title="HRV"
          hint="shaded = Garmin's baseline"
          option={{
            grid: detailGrid,
            dataZoom: zoom(startPct(data.hrv.length, 30)),
            xAxis: timeAxis('day'),
            yAxis: valueAxis({ scale: true }),
            series: [
              {
                type: 'line',
                data: data.hrv,
                smooth: true,
                symbolSize: 5,
                lineStyle: { color: HRV, width: 2 },
                itemStyle: { color: HRV },
                markArea:
                  hrvToday?.baseline_low != null && hrvToday.baseline_upper != null
                    ? { silent: true, itemStyle: { color: rgba(HRV, 0.08) }, data: [[{ yAxis: hrvToday.baseline_low }, { yAxis: hrvToday.baseline_upper }]] as never }
                    : undefined,
              },
            ],
          }}
        />
      )}

      {data.spo2.length > 0 && (
        <DetailChart
          title="Blood oxygen today"
          option={{
            grid: detailGrid,
            dataZoom: zoom(),
            xAxis: timeAxis('hour'),
            yAxis: valueAxis({ min: 85, max: 100 }),
            series: [{ type: 'scatter', data: data.spo2.map(([t, v]) => ({ value: [t, v], itemStyle: { color: v < 94 ? STRESS : SPO2 } })), symbolSize: 6 }],
          }}
        />
      )}

      {data.weight.length > 0 && (
        <DetailChart
          title={`Weight (${weightUnitLabel(units)})`}
          option={{
            grid: detailGrid,
            dataZoom: zoom(),
            xAxis: timeAxis('day'),
            yAxis: valueAxis({ scale: true }),
            series: [{ type: 'line', data: data.weight, smooth: true, symbolSize: 6, lineStyle: { color: WEIGHT, width: 2 }, itemStyle: { color: WEIGHT } }],
          }}
        />
      )}
    </div>
  )
}
