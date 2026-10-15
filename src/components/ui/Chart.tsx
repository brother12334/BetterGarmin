import ReactECharts from 'echarts-for-react'
import type { ECharts, EChartsOption } from 'echarts'

interface ChartClickParams {
  componentType: string
  seriesType?: string
  name?: string
  dataIndex?: number
  data?: unknown
}

interface ChartProps {
  option: EChartsOption
  height?: number
  className?: string
  /** Called with the hovered data index (x-axis position), or null when the pointer leaves — used to sync a map marker etc. */
  onHover?: (index: number | null) => void
  /** Called on any click within the chart (a markArea segment, a point, etc.) — inspect componentType/data to tell them apart. */
  onClick?: (params: ChartClickParams) => void
  /** Receives the ECharts instance once mounted, for pixel ↔ value conversion (e.g. draggable handles). */
  onReady?: (chart: ECharts) => void
}

/** Thin ECharts wrapper with BetterGarmin's dark-friendly defaults baked in. */
export function Chart({ option, height = 220, className, onHover, onClick, onReady }: ChartProps) {
  const merged: EChartsOption = {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'inherit', color: 'var(--text-secondary)' },
    grid: { left: 36, right: 12, top: 16, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--bg-elevated)',
      borderColor: 'var(--border-panel)',
      textStyle: { color: 'var(--text-primary)', fontSize: 12 },
    },
    ...option,
  }

  const onEvents =
    onHover || onClick
      ? {
          ...(onHover && {
            updateAxisPointer: (params: { axesInfo?: { value?: number }[] }) => {
              const value = params.axesInfo?.[0]?.value
              onHover(typeof value === 'number' ? value : null)
            },
            globalout: () => onHover(null),
          }),
          ...(onClick && { click: onClick }),
        }
      : undefined

  return (
    <div className={className}>
      <ReactECharts option={merged} style={{ height }} opts={{ renderer: 'svg' }} notMerge onEvents={onEvents} onChartReady={onReady} />
    </div>
  )
}
