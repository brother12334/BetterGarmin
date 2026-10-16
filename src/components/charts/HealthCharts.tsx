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
      <div className="flex items-center gap-1.5">
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

/** A titled card holding a large zoomable chart. */
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
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold">{title}</p>
          {info && <InfoButton title={title}>{info}</InfoButton>}
        </div>
        {hint && <span className="text-[11px] text-[var(--text-tertiary)]">{hint}</span>}
      </div>
      <Chart height={height} option={option} />
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
      {caption && <span className="-mt-3 text-[11px] text-[var(--text-tertiary)]">{caption}</span>}
    </Card>
  )
}

/** Average value per hour of the day, drawn as bars around a 24-hour clock. */
export function ClockRing({ title, perHour, color, unit, highlightAbove, info }: { title: string; perHour: (number | null)[]; color: string; unit: string; highlightAbove?: number; info?: string }) {
  const values = perHour.filter((v): v is number => v != null)
  const lo = values.length ? Math.max(0, Math.min(...values) - 15) : 0
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-1.5">
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

