export type MetricKey = 'heart' | 'sleep' | 'stress' | 'energy' | 'training' | 'readiness' | 'neutral'

interface MetricColor {
  /** Single swatch color, used for text, icons, simple strokes. */
  solid: string
  /** Gradient stops used for rings and area-chart fills. */
  gradient: [string, string]
  label: string
  /** The metric's colour block: fill and the ink that reads on it. */
  block: string
  blockInk: string
}

export const METRIC_COLORS: Record<MetricKey, MetricColor> = {
  // solid: chart and text colour (deep enough for lines on white); block: the full colour field.
  heart: { solid: '#e0457b', gradient: ['#e0457b', '#ffb8e0'], label: 'Heart', block: '#ffb8e0', blockInk: '#121212' },
  sleep: { solid: '#5a8a00', gradient: ['#5a8a00', '#c7f05a'], label: 'Sleep', block: '#c7f05a', blockInk: '#121212' },
  stress: { solid: '#f05a36', gradient: ['#f05a36', '#ff7a59'], label: 'Stress', block: '#ff7a59', blockInk: '#121212' },
  energy: { solid: '#121212', gradient: ['#121212', '#5a8a00'], label: 'Energy Reserve', block: '#121212', blockInk: '#c7f05a' },
  training: { solid: '#d49a00', gradient: ['#d49a00', '#ffd23f'], label: 'Training', block: '#ffd23f', blockInk: '#121212' },
  readiness: { solid: '#5b3df5', gradient: ['#5b3df5', '#7c66ff'], label: 'Readiness', block: '#5b3df5', blockInk: '#ffffff' },
  neutral: { solid: '#8b867f', gradient: ['#8b867f', '#b8b2a9'], label: 'Neutral', block: '#ffffff', blockInk: '#121212' },
}

/** The block for a chart/text colour, so a component given only a colour can still fill with the metric's block. */
export function blockFor(color: string): { block: string; ink: string } {
  const m = Object.values(METRIC_COLORS).find((c) => c.solid.toLowerCase() === color.toLowerCase())
  // Unknown colours get the neutral white block (concrete values: the block's own text colours derive from its ink).
  return m ? { block: m.block, ink: m.blockInk } : { block: METRIC_COLORS.neutral.block, ink: METRIC_COLORS.neutral.blockInk }
}
