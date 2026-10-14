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
  training: { solid: '#a78bfa', gradient: ['#a78bfa', '#7c6ef2'], label: 'Training' },
  readiness: { solid: '#38bdf8', gradient: ['#38bdf8', '#818cf8'], label: 'Readiness' },
  neutral: { solid: '#9aa3b2', gradient: ['#9aa3b2', '#c3c9d3'], label: 'Neutral' },
}
