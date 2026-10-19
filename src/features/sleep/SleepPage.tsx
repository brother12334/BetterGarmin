import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { BigStat, DetailChart, Dial } from '../../components/charts/HealthCharts'
import { detailGrid, fade, rgba, timeAxis, valueAxis, zoom, type Point } from '../../components/charts/chartKit'
import { METRIC_COLORS } from '../../components/ui/metricColors'
import { useData } from '../../app/DataProvider'
import { getLatestDay, getSleepRange } from '../../db/queries'
import type { SleepRow } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { formatHoursMinutes, hmsToMinutes } from '../../lib/duration'
import { parseSleepTimestamp } from '../training/matchGarminActivity'
import { HowYouSlept } from '../today/HowYouSlept'
import { SleepCoach } from './SleepCoach'
import { formatClockHours } from '../../lib/clock'

const HISTORY_DAYS = 60
const TARGET_MIN = 480 // 8h
const SLEEP = METRIC_COLORS.sleep.solid
const STAGES = [
  { key: 'deep_sleep', label: 'Deep', color: '#4338ca' },
  { key: 'light_sleep', label: 'Light', color: '#60a5fa' },
  { key: 'rem_sleep', label: 'REM', color: '#8b7bf6' },
  { key: 'awake', label: 'Awake', color: '#f59e8b' },
] as const

const dayMs = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00`).getTime()
const mins = (v: string | null) => hmsToMinutes(v) ?? 0
const startPct = (n: number, show: number) => (n > show ? Math.round((1 - show / n) * 100) : 0)

/** Clock hours for plotting a night: evening times stay as-is, after-midnight times continue past 24. */
function nightHour(ts: string | null): number | null {
  const ms = parseSleepTimestamp(ts)
  if (ms == null) return null
  const d = new Date(ms)
  const h = d.getHours() + d.getMinutes() / 60
  return h < 15 ? h + 24 : h
}

const clockLabel = formatClockHours

export function SleepPage() {
  const { loadedKinds, lastSynced } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const [data, setData] = useState<{ day: string; nights: SleepRow[] } | null>(null)
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
      const rows = await getSleepRange(addDays(day, -HISTORY_DAYS), day)
      if (!cancelled) {
        // Days the watch wasn't worn come back as all-zero rows; leave them out.
        setData({ day, nights: rows.filter((r) => mins(r.total_sleep) > 0) })
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasGarmin, lastSynced])

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

  if (!data || data.nights.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Sleep</h1>
        <Card className="text-center text-[var(--text-secondary)]">
          No sleep recorded yet. Wear your watch to bed; the night appears after it syncs the next morning.
        </Card>
      </div>
    )
  }

  const { nights } = data
  const lastNight = nights[nights.length - 1]
  const series = (f: (r: SleepRow) => number | null): Point[] =>
    nights.flatMap((r) => {
      const v = f(r)
      return v == null ? [] : [[dayMs(r.day), v] as Point]
    })
  const totalH = series((r) => +(mins(r.total_sleep) / 60).toFixed(2))
  const deep = series((r) => Math.round(mins(r.deep_sleep)))
  const rem = series((r) => Math.round(mins(r.rem_sleep)))
  const scores = series((r) => r.score)
  const bed = series((r) => nightHour(r.start))
  const wake = series((r) => nightHour(r.end))
  const avgBed = bed.length ? bed.slice(-7).reduce((a, [, v]) => a + v, 0) / Math.min(7, bed.length) : null
  const totalMin = mins(lastNight.total_sleep)
  const median = (p: Point[]) => {
    if (!p.length) return null
    const v = p.map(([, y]) => y).sort((x, y) => x - y)
    return v[Math.floor(v.length / 2)]
  }
  const usualBed = median(bed)
  const usualWake = median(wake)

  const debtSeries: Point[] = nights.map((r, i) => [
    dayMs(r.day),
    +(nights.slice(0, i + 1).reduce((d, n) => d + TARGET_MIN - mins(n.total_sleep), 0) / 60).toFixed(1),
  ])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Sleep</h1>

      <div className="grid grid-cols-2 gap-3">
        <Dial label="Sleep score" value={lastNight.score} color={SLEEP} caption={lastNight.qualifier?.toLowerCase() ?? 'last night'} />
        <Dial
          label="Of your 8 hours"
          value={Math.round((totalMin / TARGET_MIN) * 100)}
          color="#60a5fa"
          caption={`${formatHoursMinutes(totalMin)} asleep`}
        />
      </div>

      <HowYouSlept day={data.day} />

      <SleepCoach nights={nights} usualWake={usualWake} />

      <div className="grid grid-cols-2 gap-3">
        <BigStat label="Total sleep" value={formatHoursMinutes(totalMin)} color={SLEEP} trend={totalH.slice(-14)} />
        <BigStat label="Deep" value={Math.round(mins(lastNight.deep_sleep))} unit="min" color="#4338ca" trend={deep.slice(-14)} />
        <BigStat label="REM" value={Math.round(mins(lastNight.rem_sleep))} unit="min" color="#8b7bf6" trend={rem.slice(-14)} />
        <BigStat
          label="Usual bedtime"
          value={avgBed == null ? null : clockLabel(avgBed)}
          sub="average of the last week"
          color="#f59e8b"
          trend={bed.slice(-14)}
        />
      </div>

      <DetailChart
        title="Last night vs your average"
        hint={`average of ${nights.length} nights`}
        height={220}
        option={{
          grid: { left: 8, right: 44, top: 30, bottom: 8, containLabel: true },
          legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#8a92a3', fontSize: 10 } },
          tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${v} min` },
          xAxis: { type: 'value', axisLabel: { color: '#8a92a3', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(140,150,170,0.15)', type: 'dashed' } } },
          yAxis: { type: 'category', inverse: true, data: STAGES.map((st) => st.label), axisLabel: { color: '#8a92a3' }, axisLine: { show: false }, axisTick: { show: false } },
          series: [
            {
              name: 'Your average',
              type: 'bar',
              data: STAGES.map((st) => Math.round(nights.reduce((sum, r) => sum + mins(r[st.key]), 0) / nights.length)),
              itemStyle: { color: 'rgba(140,150,170,0.45)', borderRadius: 4 },
            },
            {
              name: 'Last night',
              type: 'bar',
              data: STAGES.map((st) => ({ value: Math.round(mins(lastNight[st.key])), itemStyle: { color: st.color, borderRadius: 4 } })),
              label: { show: true, position: 'right', color: '#8a92a3', fontSize: 10, formatter: '{c}m' },
            },
          ],
        }}
      />

      {bed.length > 0 && wake.length > 0 && (
        <DetailChart
          title="Bedtime and wake time"
          hint="shaded = your usual ±30 min"
          option={{
            grid: { ...detailGrid, top: 30 },
            legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#8a92a3', fontSize: 10 } },
            dataZoom: zoom(startPct(nights.length, 21)),
            xAxis: timeAxis('day'),
            yAxis: valueAxis({ inverse: true, min: 20, max: 34, interval: 2, axisLabel: { color: '#8a92a3', fontSize: 10, formatter: (v: number) => clockLabel(v) } }),
            tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => (typeof v === 'number' ? clockLabel(v) : '') },
            series: [
              {
                name: 'Bedtime',
                type: 'line',
                smooth: true,
                symbolSize: 6,
                data: bed,
                lineStyle: { color: SLEEP, width: 2.5 },
                itemStyle: { color: SLEEP },
                markArea: usualBed == null ? undefined : { silent: true, itemStyle: { color: rgba(SLEEP, 0.1) }, data: [[{ yAxis: usualBed - 0.5 }, { yAxis: usualBed + 0.5 }]] as never },
              },
              {
                name: 'Wake',
                type: 'line',
                smooth: true,
                symbolSize: 6,
                data: wake,
                lineStyle: { color: '#f5a623', width: 2.5 },
                itemStyle: { color: '#f5a623' },
                markArea: usualWake == null ? undefined : { silent: true, itemStyle: { color: rgba('#f5a623', 0.1) }, data: [[{ yAxis: usualWake - 0.5 }, { yAxis: usualWake + 0.5 }]] as never },
              },
            ],
          }}
        />
      )}

      {scores.length > 1 && (
        <DetailChart
          title="Sleep score"
          hint="pinch or drag to zoom"
          option={{
            grid: detailGrid,
            dataZoom: zoom(startPct(scores.length, 21)),
            xAxis: timeAxis('day'),
            yAxis: valueAxis({ min: 0, max: 100 }),
            series: [
              { type: 'bar', barWidth: 2, data: scores, itemStyle: { color: 'rgba(140,150,170,0.4)' }, silent: true },
              {
                type: 'scatter',
                symbolSize: 12,
                data: scores.map(([t, v]) => ({ value: [t, v], itemStyle: { color: v >= 80 ? '#34d399' : v >= 60 ? SLEEP : '#f5a623' } })),
              },
            ],
          }}
        />
      )}

      <DetailChart
        title="Sleep debt"
        hint="against 8 hours a night"
        info={`Running total of how far short of 8 hours you've slept over the last ${HISTORY_DAYS} days. Going down means you're catching up.`}
        option={{
          grid: detailGrid,
          dataZoom: zoom(),
          xAxis: timeAxis('day'),
          yAxis: valueAxis({ axisLabel: { color: '#8a92a3', fontSize: 10, formatter: '{value}h' } }),
          series: [{ type: 'line', data: debtSeries, smooth: true, showSymbol: false, lineStyle: { color: '#f5a623', width: 2 }, areaStyle: { color: fade('#f5a623', 0.2) } }],
        }}
      />

      <p className="text-center text-xs text-[var(--text-tertiary)]">
        Stages and scores are Garmin's estimates.
      </p>
    </div>
  )
}
