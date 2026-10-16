import type { EChartsOption } from 'echarts'

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

/** Pinch/scroll to zoom inside the chart, plus a slim drag handle underneath. */
export function zoom(startPct = 0): EChartsOption['dataZoom'] {
  return [
    { type: 'inside', start: startPct, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
    {
      type: 'slider',
      height: 16,
      bottom: 2,
      start: startPct,
      end: 100,
      borderColor: 'transparent',
      backgroundColor: 'rgba(140,150,170,0.08)',
      fillerColor: 'rgba(140,150,170,0.18)',
      dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
      handleSize: '100%',
      showDetail: false,
    },
  ]
}

export function timeAxis(kind: 'hour' | 'day'): EChartsOption['xAxis'] {
  return {
    type: 'time',
    axisLine: { lineStyle: { color: GRID_LINE } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: AXIS_TEXT, fontSize: 10, hideOverlap: true, formatter: kind === 'hour' ? '{HH}:{mm}' : '{MMM} {d}' },
  }
}

export function valueAxis(extra: Record<string, unknown> = {}): EChartsOption['yAxis'] {
  return { type: 'value', axisLabel: { color: AXIS_TEXT, fontSize: 10 }, splitLine: { lineStyle: { color: GRID_LINE, type: 'dashed' } }, ...extra }
}

export const detailGrid = { left: 8, right: 10, top: 14, bottom: 34, containLabel: true }

