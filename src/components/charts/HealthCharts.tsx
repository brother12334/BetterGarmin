import { cn } from '../../lib/cn'
import { useState, type ReactNode } from 'react'
import type { EChartsOption } from 'echarts'
import { blockFor, METRIC_COLORS, type MetricKey } from '../ui/metricColors'
import { Chart } from '../ui/Chart'
import { InfoButton } from '../ui/InfoButton'
import { rgba, type Point } from './chartKit'

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
  // Each headline stat is its metric's colour block; the recent trend is drawn in the block's ink.
  const { block, ink } = blockFor(color)
  return (
    <div className="metric-block flex flex-col gap-1 self-start p-4" style={{ ['--block' as string]: block, ['--block-ink' as string]: ink }}>
      <div className="flex items-center gap-2">
        <span className="blk-label text-sm">{label}</span>
        {info && <InfoButton title={label}>{info}</InfoButton>}
      </div>
      <p className={cn('blk-num mt-1 whitespace-nowrap', String(value ?? '').length > 5 ? 'text-[2rem]' : 'text-[2.75rem]')}>
        {value ?? '—'}
        {value != null && unit && <span className="ml-1 text-base font-bold tracking-normal opacity-75">{unit}</span>}
      </p>
      {sub && <p className="text-[0.8125rem] font-semibold opacity-80">{sub}</p>}
      {trend && trend.length > 1 && (
        <Chart
          height={40}
          option={{
            grid: { left: 0, right: 0, top: 4, bottom: 2 },
            tooltip: { show: false },
            xAxis: { type: 'time', show: false },
            yAxis: { type: 'value', show: false, scale: true },
            series: [{ type: 'line', data: trend, smooth: true, showSymbol: false, lineStyle: { color: ink, width: 2.5 } }],
          }}
        />
      )}
      {trend && trend.length > 1 && (
        // The line's scale in words: where the shown stretch started and ended.
        <p className="flex justify-between text-xs font-semibold opacity-75">
          <span>{endLabel(trend[0])}</span>
          <span>{endLabel(trend[trend.length - 1])}</span>
        </p>
      )}
    </div>
  )
}

function endLabel([t, v]: Point): string {
  const value = Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))
  return `${new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${value}`
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
  return ls?.color ?? (typeof is?.color === 'string' ? is.color : undefined) ?? pts.find((p) => p.color && !p.color.startsWith('rgba'))?.color ?? METRIC_COLORS.neutral.solid
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

function rangesFor(min: number, max: number, intraday: boolean): Range[] {
  if (intraday) {
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


/** An ink colour at some opacity, for the secondary series and fills drawn on a block. */
function inkAlpha(ink: string, a: number): string {
  return ink.startsWith('#') ? rgba(ink, a) : `color-mix(in srgb, ${ink} ${Math.round(a * 100)}%, transparent)`
}

/** Restyles a series to sit on its block: chunky rounded ink bars or a heavy ink line, secondary series lighter. */
function inkSeries(s: Record<string, unknown>, i: number, ink: string): Record<string, unknown> {
  const color = i === 0 ? ink : inkAlpha(ink, 0.45)
  const data = Array.isArray(s.data)
    ? (s.data as unknown[]).map((d) => (d && typeof d === 'object' && !Array.isArray(d) && 'itemStyle' in (d as object) ? { ...(d as object), itemStyle: { color } } : d))
    : s.data
  const out: Record<string, unknown> = { ...s, data }
  if (s.type === 'bar') {
    out.itemStyle = { ...(s.itemStyle as object), color, borderRadius: [6, 6, 6, 6] }
    out.barMaxWidth = 14
    out.showBackground = false
    if (s.label) out.label = { ...(s.label as object), color: ink, fontWeight: 700 }
  } else {
    out.lineStyle = { ...(s.lineStyle as object), color, width: i === 0 ? 3 : 2, shadowBlur: 0 }
    out.itemStyle = { ...(s.itemStyle as object), color, borderColor: color }
    if (s.areaStyle) out.areaStyle = { color: inkAlpha(ink, 0.12) }
  }
  if (s.markArea) out.markArea = { ...(s.markArea as object), itemStyle: { color: inkAlpha(ink, 0.1) } }
  if (s.markLine) {
    const ml = s.markLine as { lineStyle?: object; label?: object }
    // Line labels (a goal) sit inside the plot, above the line's right end, so they never clip at the block edge.
    out.markLine = { ...ml, lineStyle: { ...ml.lineStyle, color: inkAlpha(ink, 0.6) }, label: { ...ml.label, color: ink, fontWeight: 700, position: 'insideEndTop' } }
  }
  return out
}

/** The chart's own number formatting (a time-of-day axis, hours, …), so the headline says values the way the chart does. */
function formatterOf(option: EChartsOption): (v: number) => string {
  const y = (Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis) as { axisLabel?: { formatter?: unknown } } | undefined
  const f = y?.axisLabel?.formatter
  if (typeof f === 'function') return (v: number) => String((f as (v: number) => string)(v))
  if (typeof f === 'string') return (v: number) => f.replace('{value}', String(Math.round(v * 10) / 10))
  return (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10))
}

/** A plain-language headline computed from the chart's own points: the day's peak, or the period's average. */
function headlineFor(pts: Raw[], intraday: boolean, range: Range | undefined, fmt: (v: number) => string, unit?: string): ReactNode {
  const shown = pts.filter((p) => (range?.from == null || p.t >= range.from) && (range?.to == null || p.t <= range.to))
  if (!shown.length) return null
  const u = unit ? ` ${unit}` : ''
  const last = shown[shown.length - 1]
  const peak = shown.reduce((a, b) => (b.v > a.v ? b : a))
  if (intraday) {
    const at = new Date(peak.t).toLocaleTimeString([], { hour: 'numeric' })
    return (
      <>
        Peaked at <Hl>{fmt(peak.v)}{u}</Hl> around {at}, latest {fmt(last.v)}{u}.
      </>
    )
  }
  const avg = shown.reduce((a, b) => a + b.v, 0) / shown.length
  const span = range?.key === 'week' ? 'this week' : range?.key === 'month' ? 'this month' : range?.key === 'quarter' ? 'over 3 months' : 'overall'
  return (
    <>
      <Hl>{fmt(avg)}{u}</Hl> on average {span}, latest {fmt(last.v)}{u}
      {/* A "high" means nothing for times of day (bedtimes), so it's left out there. */}
      {/[AP]M|:/.test(fmt(peak.v)) ? '' : `, high ${fmt(peak.v)}${u}`}.
    </>
  )
}

/** The key number in a headline, set on an ink pill so it reads first. */
export function Hl({ children }: { children: ReactNode }) {
  return <span className="rounded-lg bg-[var(--block-ink)] px-1.5 text-[var(--block)]">{children}</span>
}

/**
 * A chart as its measure's colour block: a plain-language headline worked out from the data, then the chart in the
 * block's ink (chunky rounded bars or a heavy line, no grid, no y-axis). Day charts show the whole day, one bar per
 * hour; history charts get one-tap chips for the time span. A chart with no axes (the sport-mix pie) keeps its own
 * colours on a white block.
 */
export function DetailChart({
  title,
  hint,
  option,
  height = 200,
  info,
  unit,
  metric,
  headline: givenHeadline,
}: {
  title: string
  hint?: string
  option: EChartsOption
  height?: number
  info?: string
  /** Shown after the numbers in the headline, e.g. "bpm". */
  unit?: string
  /** Which colour block to use when the series colours don't say (a gradient-coloured line, mixed bars). */
  metric?: MetricKey
  /** A headline written by the caller, for charts whose points the generic one can't read (category axes). */
  headline?: ReactNode
}) {
  const allSeries = (Array.isArray(option.series) ? option.series : option.series ? [option.series] : []) as Record<string, unknown>[]
  const allPts = allSeries.flatMap(pointsOf)
  const min = allPts.length ? Math.min(...allPts.map((p) => p.t)) : 0
  const max = allPts.length ? Math.max(...allPts.map((p) => p.t)) : 0
  // Day charts are the ones built on an hour axis; a short history of daily values is still a history chart.
  const axisId = ((Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis) as { id?: string } | undefined)?.id
  const intraday = allPts.length > 0 && axisId === 'hour'
  const ranges = allPts.length ? rangesFor(min, max, intraday) : []
  // Long histories open on the most recent stretch; a single day opens on the whole day.
  const defaultKey = intraday ? 'all' : (ranges.find((r) => r.key === 'month') ?? ranges[0])?.key
  const [key, setKey] = useState<string | undefined>(undefined)
  const active = ranges.find((r) => r.key === (key ?? defaultKey))

  const baseX = (Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis) as Record<string, unknown>
  const primaryPts = allSeries[0] ? pointsOf(allSeries[0]) : []
  const neutral = { block: METRIC_COLORS.neutral.block, ink: METRIC_COLORS.neutral.blockInk }
  const { block, ink } = metric
    ? { block: METRIC_COLORS[metric].block, ink: METRIC_COLORS[metric].blockInk }
    : baseX && allSeries[0]
      ? blockFor(seriesColor(allSeries[0], primaryPts))
      : neutral
  // Day charts show hourly bars, so the headline quotes the hourly figures you can see, not single raw readings.
  const headlinePts: Raw[] = intraday ? bucket(primaryPts, HOUR).map(([t, v]) => ({ t, v })) : primaryPts

  const shaped = intraday
    ? allSeries.map((s) => ({ type: 'bar', data: bucket(pointsOf(s), HOUR), barWidth: '70%' }) as Record<string, unknown>)
    : allSeries
  const series = baseX ? shaped.map((s, i) => inkSeries(s, i, ink)) : allSeries

  const { dataZoom: _dropped, visualMap: _vm, ...rest } = option
  void _dropped
  void _vm
  const labelColor = inkAlpha(ink, 0.65)
  const xAxis = {
    ...baseX,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    ...(active?.from != null ? { min: active.from, max: active.to } : {}),
    // Edge labels align inward so the first and last dates never clip at the block's edge.
    axisLabel: { ...(baseX?.axisLabel as object), color: labelColor, fontSize: 11, fontWeight: 700, alignMinLabel: 'left', alignMaxLabel: 'right', ...(baseX?.type === 'value' && { show: false }) },
    ...(!intraday && allPts.length > 0 && {
      // At most about four date labels whatever the span, so dates never run into each other.
      minInterval: Math.max(1, Math.ceil(((active?.to ?? max) - (active?.from ?? min)) / DAY / 4)) * DAY,
    }),
    ...(intraday && {
      // Ticks every 2 hours, labelled only at 6a, 12p and 6p (short, so they fit on a phone).
      minInterval: 2 * HOUR,
      maxInterval: 2 * HOUR,
      axisLabel: { color: labelColor, fontSize: 11, fontWeight: 700, hideOverlap: true, formatter: (v: number) => ({ 6: '6a', 12: '12p', 18: '6p' } as Record<number, string>)[new Date(v).getHours()] ?? '' },
    }),
  }
  const baseY = (Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis) as Record<string, unknown> | undefined
  // No y-axis or grid: the headline carries the numbers and the shape carries the rest.
  // A category y-axis (a horizontal bar chart) keeps its labels, in ink.
  const yAxis = baseY
    ? baseY.type === 'category'
      ? { ...baseY, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { ...(baseY.axisLabel as object), color: labelColor, fontWeight: 700 } }
      : { ...baseY, axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } }
    : undefined
  const legend = rest.legend ? { ...(rest.legend as object), textStyle: { color: labelColor, fontWeight: 700 } } : undefined
  // Bars with value labels at their ends need room on the right.
  const labelled = allSeries.some((x) => (x.label as { show?: boolean } | undefined)?.show)
  const grid = { left: 12, right: labelled ? 40 : 12, top: legend ? 28 : 8, bottom: 4, containLabel: true }
  // A chart without axes (the sport-mix pie) must not get one: an axis with no grid crashed ECharts and left the card empty.
  const finalOption = (baseX ? { ...rest, legend, grid, xAxis, yAxis, series } : { ...rest, series }) as EChartsOption
  const headline = givenHeadline ?? (baseX ? headlineFor(headlinePts, intraday, active, formatterOf(option), unit) : null)

  return (
    <div className="metric-block p-4" style={{ ['--block' as string]: block, ['--block-ink' as string]: ink }}>
      <div className="flex items-center gap-2">
        <p className="blk-label text-sm opacity-80">{title}</p>
        {info && <InfoButton title={title}>{info}</InfoButton>}
      </div>
      {headline && <p className="mt-1.5 text-[1.375rem] font-extrabold leading-tight tracking-tight">{headline}</p>}
      {hint && <p className="mt-1 text-xs font-semibold opacity-70">{hint}</p>}
      {ranges.length > 1 && (
        <div className="mt-3 flex gap-1">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setKey(r.key)}
              aria-pressed={r.key === active?.key}
              className={`min-w-0 flex-1 truncate rounded-full px-1 py-1.5 text-xs font-bold transition-colors ${
                r.key === active?.key ? 'bg-[var(--block-ink)] text-[var(--block)]' : 'bg-[var(--bg-panel)] text-[var(--text-primary)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2">
        <Chart height={height} option={finalOption} />
      </div>
    </div>
  )
}

/** A 0–max value as its metric's colour block: label, one big number and a caption. */
export function Dial({ label, value, color, caption }: { label: string; value: number | null; max?: number; color: string; caption?: string }) {
  const { block, ink } = blockFor(color)
  return (
    <div className="metric-block flex flex-col p-4" style={{ ['--block' as string]: block, ['--block-ink' as string]: ink }}>
      <span className="blk-label text-sm">{label}</span>
      <span className="blk-num mt-2 text-[3.5rem]">{value == null ? '—' : Math.round(value)}</span>
      {caption && <span className="mt-1 text-[0.8125rem] font-semibold opacity-80">{caption}</span>}
    </div>
  )
}

/** Average value per hour of the day, drawn as bars around a 24-hour clock. */
export function ClockRing({ title, perHour, color, unit, highlightAbove, info }: { title: string; perHour: (number | null)[]; color: string; unit: string; highlightAbove?: number; info?: string }) {
  // Drawn as a colour block: a headline naming the highest and lowest hours, then 24 ink bars (above-normal hours solid).
  const { block, ink } = blockFor(color)
  const known = perHour.map((v, h) => ({ v, h })).filter((x): x is { v: number; h: number } => x.v != null)
  const lo = known.length ? Math.max(0, Math.min(...known.map((x) => x.v)) - 10) : 0
  const hi = known.length ? known.reduce((a, b) => (b.v > a.v ? b : a)) : null
  const low = known.length ? known.reduce((a, b) => (b.v < a.v ? b : a)) : null
  const hour = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })
  return (
    <div className="metric-block p-4" style={{ ['--block' as string]: block, ['--block-ink' as string]: ink }}>
      <div className="flex items-center gap-2">
        <p className="blk-label text-sm opacity-80">{title}</p>
        {info && <InfoButton title={title}>{info}</InfoButton>}
      </div>
      {hi && low && (
        <p className="mt-1.5 text-[1.375rem] font-extrabold leading-tight tracking-tight">
          Highest around {hour(hi.h)} at <Hl>{Math.round(hi.v)} {unit}</Hl>, lowest around {hour(low.h)} at {Math.round(low.v)}.
        </p>
      )}
      <div className="mt-2">
        <Chart
          height={150}
          option={{
            tooltip: { trigger: 'item', formatter: (p: unknown) => {
              const { name, value } = p as { name: string; value: number | null }
              return value == null ? `${hour(Number(name))} · no data` : `${hour(Number(name))} · ${value} ${unit}`
            } },
            grid: { left: 4, right: 4, top: 8, bottom: 4, containLabel: true },
            xAxis: {
              type: 'category',
              data: [...Array(24).keys()].map(String),
              axisLine: { show: false },
              axisTick: { show: false },
              axisLabel: { color: inkAlpha(ink, 0.65), fontSize: 11, fontWeight: 700, interval: 0, formatter: (v: string) => ({ 0: '12a', 6: '6a', 12: '12p', 18: '6p' } as Record<string, string>)[v] ?? '' },
            },
            yAxis: { type: 'value', min: lo, show: false },
            series: [
              {
                type: 'bar',
                barMaxWidth: 14,
                data: perHour.map((v) => ({
                  value: v,
                  itemStyle: { color: highlightAbove != null && v != null && v > highlightAbove ? ink : inkAlpha(ink, 0.45), borderRadius: 6 },
                })),
              },
            ],
          }}
        />
      </div>
    </div>
  )
}

