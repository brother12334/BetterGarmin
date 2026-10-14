/** Simple descriptive stats used to build "personal baselines" rather than generic population norms. */
export interface Baseline {
  mean: number
  stdDev: number
  min: number
  max: number
  n: number
}

export function computeBaseline(values: number[]): Baseline | null {
  const valid = values.filter((v) => Number.isFinite(v))
  if (valid.length === 0) return null
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length
  const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length
  return {
    mean,
    stdDev: Math.sqrt(variance),
    min: Math.min(...valid),
    max: Math.max(...valid),
    n: valid.length,
  }
}

/** How many standard deviations a value is from baseline — the basis for "unusual day" highlighting. */
export function zScore(value: number, baseline: Baseline): number {
  if (baseline.stdDev === 0) return 0
  return (value - baseline.mean) / baseline.stdDev
}
