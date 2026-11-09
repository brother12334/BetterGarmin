import { BigStat, DetailChart, Dial, Hl } from '../../components/charts/HealthCharts'
import { detailGrid, rgba, timeAxis, valueAxis, zoom, type Point } from '../../components/charts/chartKit'
import { METRIC_COLORS } from '../../components/ui/metricColors'
import { useUnits } from '../../app/units'
import { convertDistance, distanceUnitLabel } from '../../lib/units'
import type { ActivityRow } from '../../db/types'
import { hmsToMinutes } from '../../lib/duration'

const TRAIN = METRIC_COLORS.training.solid
const DAY = 86_400_000

const dayStart = (ts: string) => {
  const d = new Date(ts.replace(' ', 'T'))
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** Dials, headline numbers and zoomable charts summarising the loaded activities. */
export function TrainingOverview({ activities, latestDay }: { activities: ActivityRow[]; latestDay: string }) {
  const { units } = useUnits()
  const dated = activities.filter((a) => a.start_time)
  const end = new Date(`${latestDay.slice(0, 10)}T00:00:00`).getTime() + DAY
  const inLast = (days: number, offset = 0) =>
    dated.filter((a) => {
      const t = dayStart(a.start_time as string)
      return t >= end - (days + offset) * DAY && t < end - offset * DAY
    })
  const week = inLast(7)
  const prevWeeks = inLast(28, 7)
  const minutes = (list: ActivityRow[]) => list.reduce((s, a) => s + (hmsToMinutes(a.moving_time ?? a.elapsed_time) ?? 0), 0)
  const load = (list: ActivityRow[]) => list.reduce((s, a) => s + (a.training_load ?? 0), 0)
  const weekMin = Math.round(minutes(week))
  const usualWeekMin = Math.round(minutes(prevWeeks) / 4)
  const weekDist = convertDistance(week.reduce((s, a) => s + (a.distance ?? 0), 0), units)
  const hrs = week.map((a) => a.avg_hr).filter((v): v is number => v != null)

  // Per-day totals for the trends and detail charts.
  const byDay = new Map<number, { load: number; min: number; count: number }>()
  for (const a of dated) {
    const t = dayStart(a.start_time as string)
    const d = byDay.get(t) ?? { load: 0, min: 0, count: 0 }
    d.load += a.training_load ?? 0
    d.min += hmsToMinutes(a.moving_time ?? a.elapsed_time) ?? 0
    d.count += 1
    byDay.set(t, d)
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  const loadPts: Point[] = days.map((t) => [t, Math.round(byDay.get(t)!.load)])
  const minPts: Point[] = days.map((t) => [t, Math.round(byDay.get(t)!.min)])
  const avg7: Point[] = days.map((t) => [t, Math.round(loadPts.filter(([x]) => x > t - 7 * DAY && x <= t).reduce((s, [, v]) => s + v, 0) / 7)])

  const sports = [...new Set(dated.map((a) => a.sport ?? 'other'))]
  const mix = sports.map((s) => ({
    name: label(s),
    value: Math.round(minutes(dated.filter((a) => (a.sport ?? 'other') === s))),
  }))
  const startPct = days.length > 30 ? Math.round((1 - 30 / days.length) * 100) : 0

  if (dated.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Dial
          label="This week vs usual"
          value={usualWeekMin > 0 ? Math.min(200, Math.round((weekMin / usualWeekMin) * 100)) : null}
          max={200}
          color={TRAIN}
          caption={usualWeekMin > 0 ? '% of your usual week' : 'needs a few weeks of history'}
        />
        <Dial label="Load this week" value={Math.round(load(week))} max={Math.max(100, Math.round(load(prevWeeks) / 4) * 2)} color={TRAIN} caption="Garmin training load" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BigStat label="Workouts" value={week.length} sub="last 7 days" color={TRAIN} trend={loadPts.slice(-14)} />
        <BigStat label="Active time" value={`${Math.floor(weekMin / 60)}h ${weekMin % 60}m`} sub="last 7 days" color={TRAIN} trend={minPts.slice(-14)} />
        <BigStat label="Distance" value={weekDist.toFixed(1)} unit={distanceUnitLabel(units)} sub="last 7 days" color={METRIC_COLORS.neutral.solid} />
        <BigStat label="Avg heart rate" value={hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null} unit="bpm" sub="during workouts" color="#e0457b" />
      </div>

      {loadPts.length > 0 && (
        <DetailChart
          title="Training load"
          metric="training"
          hint="bars = day, line = 7-day average"
          option={{
            grid: detailGrid,
            dataZoom: zoom(startPct),
            xAxis: timeAxis('day'),
            yAxis: valueAxis(),
            series: [
              { type: 'bar', barWidth: '55%', data: loadPts, itemStyle: { color: rgba(TRAIN, 0.55), borderRadius: [4, 4, 0, 0] } },
              { type: 'line', data: avg7, smooth: true, showSymbol: false, lineStyle: { color: TRAIN, width: 3 } },
            ],
          }}
        />
      )}

      {minPts.length > 0 && (
        <DetailChart
          title="Active minutes"
          metric="training"
          unit="min"
          option={{
            grid: detailGrid,
            dataZoom: zoom(startPct),
            xAxis: timeAxis('day'),
            yAxis: valueAxis(),
            series: [{ type: 'bar', barWidth: '55%', data: minPts, itemStyle: { color: '#5b3df5', borderRadius: [4, 4, 0, 0] } }],
          }}
        />
      )}

      {mix.length > 1 && <SportMix mix={mix} />}
    </>
  )
}

/** Minutes per sport as the training block: a headline naming the main sport, then one ink bar per sport. */
function SportMix({ mix }: { mix: { name: string; value: number }[] }) {
  const sorted = [...mix].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((a, b) => a + b.value, 0)
  const top = sorted[0]
  return (
    <div className="metric-block p-4" style={{ ['--block' as string]: METRIC_COLORS.training.block, ['--block-ink' as string]: METRIC_COLORS.training.blockInk }}>
      <p className="blk-label text-sm opacity-80">Sport mix</p>
      <p className="mt-1.5 text-[1.375rem] font-extrabold leading-tight tracking-tight">
        Mostly <Hl>{top.name.toLowerCase()}</Hl>, {Math.round((top.value / total) * 100)}% of your {total.toLocaleString()} minutes.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {sorted.map((m) => (
          <div key={m.name} className="flex flex-col gap-1 text-sm font-semibold">
            <span className="flex justify-between gap-2">
              <span>{m.name}</span>
              <span className="tabular-nums">{m.value.toLocaleString()} min</span>
            </span>
            <span className="h-3 rounded-full bg-[var(--bg-panel)]">
              <span className="block h-full rounded-full bg-[var(--block-ink)]" style={{ width: `${Math.max(3, (m.value / top.value) * 100)}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
