export type MetricKey = 'heart' | 'sleep' | 'stress' | 'energy' | 'training' | 'readiness' | 'neutral'

interface MetricColor {
  /** Single swatch color, used for text, icons, simple strokes. */
  solid: string
  /** Gradient stops used for rings and area-chart fills. */
  gradient: [string, string]
  label: string
}

export const METRIC_COLORS: Record<MetricKey, MetricColor> = {
  heart: { solid: '#c2412d', gradient: ['#c2412d', '#d9654f'], label: 'Heart' },
  sleep: { solid: '#4f4fae', gradient: ['#4f4fae', '#7676c7'], label: 'Sleep' },
  stress: { solid: '#c98a14', gradient: ['#c98a14', '#dba53f'], label: 'Stress' },
  energy: { solid: '#2f7d4a', gradient: ['#2f7d4a', '#2c6e9b'], label: 'Energy Reserve' },
  training: { solid: '#1f7a78', gradient: ['#1f7a78', '#2f9592'], label: 'Training' },
  readiness: { solid: '#2c6e9b', gradient: ['#2c6e9b', '#4b8cb8'], label: 'Readiness' },
  neutral: { solid: '#7d8279', gradient: ['#7d8279', '#a1a69c'], label: 'Neutral' },
}
