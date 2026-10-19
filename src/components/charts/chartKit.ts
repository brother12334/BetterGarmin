import type { EChartsOption } from 'echarts'
import { formatTime } from '../../lib/clock'

export type Point = [number, number]

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

export const fade = (color: string, a = 0.3) => ({
  type: 'linear' as const,
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: rgba(color, a) },
    { offset: 1, color: rgba(color, 0) },
  ],
})

export const AXIS_TEXT = '#8a92a3'
export const GRID_LINE = 'rgba(140,150,170,0.15)'

/** Frosted-glass zoom pill that floats inside the bottom of the plot. Shared so every chart's zoom feels the same. */
export const GLASS_SLIDER = {
  type: 'slider' as const,
  height: 12,
  bottom: 30,
  left: 56,
  right: 22,
  borderColor: 'rgba(255,255,255,0.28)',
  borderRadius: 6,
  backgroundColor: 'rgba(255,255,255,0.07)',
  fillerColor: 'rgba(255,255,255,0.32)',
  dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
  selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
  handleSize: 0,
  moveHandleSize: 0,
  showDetail: false,
  brushSelect: false,
  // Redraw on every pointer move, with no throttling, so the chart tracks the finger exactly.
  realtime: true,
  throttle: 0,
}

/** Pinch/scroll to zoom inside the chart, plus the glass pill to drag. */
export function zoom(startPct = 0): EChartsOption['dataZoom'] {
  return [
    { type: 'inside', start: startPct, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true, throttle: 0 },
    { ...GLASS_SLIDER, start: startPct, end: 100 },
  ]
}

const DAY_MS = 86_400_000

/** Date label for a day axis: only ticks on a midnight get a label, so a short history never repeats "Oct 16 Oct 16". */
export function dayLabel(v: number): string {
  const d = new Date(v)
  return d.getHours() === 0 && d.getMinutes() === 0 ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
}

/** Axis settings shared by every date axis: whole days only, no crowding. */
export const DAY_AXIS = { minInterval: DAY_MS, splitNumber: 4 } as const

export function timeAxis(kind: 'hour' | 'day'): EChartsOption['xAxis'] {
  return {
    id: kind,
    ...(kind === 'day' ? DAY_AXIS : { minInterval: 3_600_000 }),
    type: 'time',
    axisLine: { lineStyle: { color: GRID_LINE } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: AXIS_TEXT, fontSize: 10, hideOverlap: true, formatter: kind === 'hour' ? (v: number) => formatTime(v) : dayLabel },
  }
}

export function valueAxis(extra: Record<string, unknown> = {}): EChartsOption['yAxis'] {
  return { type: 'value', axisLabel: { color: AXIS_TEXT, fontSize: 10 }, splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } }, ...extra }
}

export const detailGrid = { left: 8, right: 10, top: 14, bottom: 8, containLabel: true }

