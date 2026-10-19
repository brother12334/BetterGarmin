export type MetricKey = 'heart' | 'sleep' | 'stress' | 'energy' | 'training' | 'readiness' | 'neutral'

interface MetricColor {
  /** Single swatch color, used for text, icons, simple strokes. */
  solid: string
  /** Gradient stops used for rings and area-chart fills. */
  gradient: [string, string]
  label: string
}

export const METRIC_COLORS: Record<MetricKey, MetricColor> = {
  heart: { solid: '#fb4a59', gradient: ['#fb4a59', '#ff8a7a'], label: 'Heart' },
  sleep: { solid: '#8b7bf6', gradient: ['#8b7bf6', '#c2b6ff'], label: 'Sleep' },
  stress: { solid: '#f5a623', gradient: ['#f5a623', '#ffd37a'], label: 'Stress' },
  energy: { solid: '#34d399', gradient: ['#34d399', '#38bdf8'], label: 'Energy Reserve' },
  training: { solid: '#2dd4bf', gradient: ['#2dd4bf', '#14b8a6'], label: 'Training' },
  readiness: { solid: '#38bdf8', gradient: ['#38bdf8', '#60a5fa'], label: 'Readiness' },
  neutral: { solid: '#9aa3b2', gradient: ['#9aa3b2', '#c3c9d3'], label: 'Neutral' },
}
