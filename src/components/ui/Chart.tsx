import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface ChartProps {
  option: EChartsOption
  height?: number
  className?: string
  /** Called with the hovered data index (x-axis position), or null when the pointer leaves — used to sync a map marker etc. */
  onHover?: (index: number | null) => void
}

/** Thin ECharts wrapper with BetterGarmin's dark-friendly defaults baked in. */
export function Chart({ option, height = 220, className, onHover }: ChartProps) {
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

  const onEvents = onHover
    ? {
        updateAxisPointer: (params: { axesInfo?: { value?: number }[] }) => {
          const value = params.axesInfo?.[0]?.value
          onHover(typeof value === 'number' ? value : null)
        },
        globalout: () => onHover(null),
      }
    : undefined

  return (
    <div className={className}>
      <ReactECharts option={merged} style={{ height }} opts={{ renderer: 'svg' }} notMerge onEvents={onEvents} />
    </div>
  )
}
