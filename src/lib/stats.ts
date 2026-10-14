export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < values.length; i++) {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null)
    out.push(slice.length > 0 ? slice.reduce((s, v) => s + v, 0) / slice.length : null)
  }
  return out
}

export interface CorrelationResult {
  r: number
  n: number
  strength: 'negligible' | 'weak' | 'moderate' | 'strong' | 'very strong'
  direction: 'positive' | 'negative' | 'none'
}

/** Pearson correlation coefficient over paired (x, y) samples, skipping any pair with a null. */
export function pearsonCorrelation(pairs: [number | null, number | null][]): CorrelationResult | null {
  const valid = pairs.filter((p): p is [number, number] => p[0] != null && p[1] != null)
  if (valid.length < 5) return null

  const n = valid.length
  const xs = valid.map((p) => p[0])
  const ys = valid.map((p) => p[1])
  const meanX = xs.reduce((s, v) => s + v, 0) / n
  const meanY = ys.reduce((s, v) => s + v, 0) / n

  let cov = 0
  let varX = 0
  let varY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    cov += dx * dy
    varX += dx * dx
    varY += dy * dy
  }
  const denom = Math.sqrt(varX * varY)
  const r = denom === 0 ? 0 : cov / denom

  const abs = Math.abs(r)
  const strength = abs < 0.1 ? 'negligible' : abs < 0.3 ? 'weak' : abs < 0.5 ? 'moderate' : abs < 0.7 ? 'strong' : 'very strong'
  const direction = abs < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative'

  return { r, n, strength, direction }
}
