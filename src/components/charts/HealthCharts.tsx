import { useState } from 'react'
import type { EChartsOption } from 'echarts'
import { Card } from '../ui/Card'
import { Chart } from '../ui/Chart'
import { InfoButton } from '../ui/InfoButton'
import { AXIS_TEXT, GRID_LINE, fade, rgba, type Point } from './chartKit'

/**
 * Building blocks for the "big numbers + detail" and "rings & dials" chart style: a headline number with a
 * mini trend, a large zoomable detail chart, a radial gauge, and a 24-hour clock ring.
 */

/** The headline number for one measurement, with an optional mini trend line. */
export function BigStat({
  label,
  value,
  unit,
  sub,
  color,
  trend,
  info,
}: {
  label: string
  value: string | number | null
  unit?: string
  sub?: string
  color: string
  trend?: Point[]
  info?: string
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
        {info && <InfoButton title={label}>{info}</InfoButton>}
      </div>
      <p className="text-3xl font-extrabold tabular-nums leading-tight">
        {value ?? '—'}
        {value != null && unit && <span className="ml-1 text-sm font-semibold text-[var(--text-tertiary)]">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-[var(--text-tertiary)]">{sub}</p>}
      {trend && trend.length > 1 && (
        <Chart
          height={46}
          option={{
            grid: { left: 0, right: 0, top: 4, bottom: 2 },
            tooltip: { show: false },
            xAxis: { type: 'time', show: false },
            yAxis: { type: 'value', show: false, scale: true },
            series: [{ type: 'line', data: trend, smooth: true, showSymbol: false, lineStyle: { color, width: 2.5 }, areaStyle: { color: fade(color, 0.22) } }],
          }}
        />
      )}
    </Card>
  )
}

type Raw = { t: number; v: number; color?: string }
type Range = { key: string; label: string; from: number | null; to: number | null }

const HOUR = 3600_000
const DAY = 24 * HOUR

function pointsOf(series: Record<string, unknown>): Raw[] {
  const data = (series.data as unknown[]) ?? []
  const out: Raw[] = []
  for (const d of data) {
    const pair = Array.isArray(d) ? d : ((d as { value?: unknown })?.value as unknown[] | undefined)
    if (!Array.isArray(pair)) continue
    const t = typeof pair[0] === 'number' ? pair[0] : new Date(pair[0] as string).getTime()
    const v = pair[1]
    if (Number.isFinite(t) && typeof v === 'number') out.push({ t, v, color: (d as { itemStyle?: { color?: string } })?.itemStyle?.color })
  }
  return out
}

function seriesColor(series: Record<string, unknown>, pts: Raw[]): string {
  const ls = series.lineStyle as { color?: string } | undefined
  const is = series.itemStyle as { color?: string } | undefined
  return ls?.color ?? (typeof is?.color === 'string' ? is.color : undefined) ?? pts.find((p) => p.color && !p.color.startsWith('rgba'))?.color ?? '#38bdf8'
}

/** Averages samples into fixed time buckets (centred), so a day reads as a calm shape instead of hundreds of spikes. */
function bucket(pts: Raw[], size: number): [number, number][] {
  const sums = new Map<number, { s: number; n: number }>()
  for (const p of pts) {
    const k = Math.floor(p.t / size) * size
    const e = sums.get(k) ?? { s: 0, n: 0 }
    e.s += p.v
    e.n++
    sums.set(k, e)
  }
  return [...sums.entries()].sort((x, y) => x[0] - y[0]).map(([k, e]) => [k + size / 2, Math.round(e.s / e.n)])
}

function rangesFor(min: number, max: number): Range[] {
  if (max - min <= 2 * DAY) {
    // A day chart always shows the whole day, midnight to midnight.
    const day = new Date(max)
    day.setHours(0, 0, 0, 0)
    return [{ key: 'all', label: 'Day', from: day.getTime(), to: day.getTime() + DAY }]
  }
  const span = max - min
  const r: Range[] = [{ key: 'week', label: 'Week', from: max - 7 * DAY, to: max + DAY / 2 }]
  if (span > 10 * DAY) r.push({ key: 'month', label: 'Month', from: max - 30 * DAY, to: max + DAY / 2 })
  if (span > 40 * DAY) r.push({ key: 'quarter', label: '3 months', from: max - 91 * DAY, to: max + DAY / 2 })
  r.push({ key: 'all', label: 'All', from: null, to: null })
  return r
}


/**
 * A titled card holding a large chart, with no pinch or drag. Day charts show the whole day as blocks, one rounded
 * bar per hour; history charts get one-tap chips for the time span.
 */
export function DetailChart({
  title,
  hint,
  option,
  height = 240,
  info,
}: {
  title: string
  hint?: string
  option: EChartsOption
  height?: number
  info?: string
}) {
  const allSeries = (Array.isArray(option.series) ? option.series : option.series ? [option.series] : []) as Record<string, unknown>[]
  const allPts = allSeries.flatMap(pointsOf)
  const min = allPts.length ? Math.min(...allPts.map((p) => p.t)) : 0
  const max = allPts.length ? Math.max(...allPts.map((p) => p.t)) : 0
  const intraday = allPts.length > 0 && max - min <= 2 * DAY
  const ranges = allPts.length ? rangesFor(min, max) : []
  // Long histories open on the most recent stretch; a single day opens on the whole day.
  const defaultKey = intraday ? 'all' : (ranges.find((r) => r.key === 'month') ?? ranges[0])?.key
  const [key, setKey] = useState<string | undefined>(undefined)
  const active = ranges.find((r) => r.key === (key ?? defaultKey))

  const reshaped = intraday
  const series = reshaped
    ? allSeries.map((s) => {
        const pts = pointsOf(s)
        const color = seriesColor(s, pts)
        const data = bucket(pts, HOUR)
        return { type: 'bar', data, barWidth: '70%', itemStyle: { color, borderRadius: [4, 4, 0, 0] } }
      })
    : allSeries

  const { dataZoom: _dropped, ...rest } = option
  void _dropped
  const baseX = (Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis) as Record<string, unknown>
  const xAxis = {
    ...baseX,
    ...(active?.from != null ? { min: active.from, max: active.to } : {}),
    ...(intraday && {
      // Whole hours only ("6 AM"), spaced so labels never collide.
      // Ticks every 2 hours, labelled only at 6 AM, 12 PM and 6 PM so the times never crowd.
      minInterval: 2 * HOUR,
      maxInterval: 2 * HOUR,
      axisLabel: { ...(baseX?.axisLabel as object), fontSize: 11, hideOverlap: true, formatter: (v: number) => ([6, 12, 18].includes(new Date(v).getHours()) ? new Date(v).toLocaleTimeString([], { hour: 'numeric' }) : '') },
    }),
  }
  const grid = intraday ? { ...(rest.grid as object), left: 8, right: 24, containLabel: true } : rest.grid
  const finalOption = { ...rest, grid, xAxis, series } as EChartsOption

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{title}</p>
          {info && <InfoButton title={title}>{info}</InfoButton>}
          {hint && <span className="text-[11px] text-[var(--text-tertiary)]">{hint}</span>}
        </div>
      </div>
      {ranges.length > 1 && (
        <div className="mb-2 flex gap-1">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setKey(r.key)}
              className={`min-w-0 flex-1 truncate rounded-full px-1 py-1 text-[11px] font-medium transition-colors ${
                r.key === active?.key ? 'bg-[var(--accent)] text-black' : 'bg-[var(--ring-track)] text-[var(--text-secondary)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      <Chart height={height} option={finalOption} />
    </Card>
  )
}

function textColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#f4f5f7'
}

/** A radial gauge for a 0–max value. */
export function Dial({ label, value, max = 100, color, caption }: { label: string; value: number | null; max?: number; color: string; caption?: string }) {
  return (
    <Card className="flex flex-col items-center p-3">
      <span className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
      <Chart
        className="w-full"
        height={150}
        option={{
          tooltip: { show: false },
          series: [
            {
              type: 'gauge',
              startAngle: 220,
              endAngle: -40,
              min: 0,
              max,
              radius: '92%',
              progress: { show: value != null, width: 12, roundCap: true, itemStyle: { color } },
              axisLine: { roundCap: true, lineStyle: { width: 12, color: [[1, 'rgba(140,150,170,0.18)']] } },
              pointer: { show: false },
              axisTick: { show: false },
              splitLine: { show: false },
              axisLabel: { show: false },
              detail: { fontSize: 28, fontWeight: 800, color: textColor(), offsetCenter: [0, '4%'], formatter: value == null ? '—' : '{value}' },
              title: { show: false },
              data: [{ value: value ?? 0 }],
            },
          ],
        }}
      />
      {caption && <span className="-mt-3 text-xs text-[var(--text-tertiary)]">{caption}</span>}
    </Card>
  )
}

/** Average value per hour of the day, drawn as bars around a 24-hour clock. */
export function ClockRing({ title, perHour, color, unit, highlightAbove, info }: { title: string; perHour: (number | null)[]; color: string; unit: string; highlightAbove?: number; info?: string }) {
  const values = perHour.filter((v): v is number => v != null)
  const lo = values.length ? Math.max(0, Math.min(...values) - 15) : 0
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-2">
        <p className="font-semibold">{title}</p>
        {info && <InfoButton title={title}>{info}</InfoButton>}
      </div>
      <Chart
        height={280}
        option={{
          tooltip: { trigger: 'item', formatter: (p: unknown) => {
            const { name, value } = p as { name: string; value: number | null }
            return value == null ? `${name}:00 · no data` : `${name}:00 · ${value} ${unit}`
          } },
          polar: { radius: ['16%', '80%'] },
          angleAxis: {
            type: 'category',
            data: [...Array(24).keys()].map(String),
            startAngle: 90,
            axisLine: { lineStyle: { color: GRID_LINE } },
            axisTick: { show: false },
            axisLabel: { color: AXIS_TEXT, fontSize: 9, interval: 2 },
          },
          radiusAxis: { min: lo, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } } },
          series: [
            {
              type: 'bar',
              coordinateSystem: 'polar',
              data: perHour.map((v) => ({
                value: v,
                itemStyle: { color: highlightAbove != null && v != null && v > highlightAbove ? color : rgba(color, 0.5), borderRadius: 4 },
              })),
            },
          ],
        }}
      />
    </Card>
  )
}

