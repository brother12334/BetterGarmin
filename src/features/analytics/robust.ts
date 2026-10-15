/**
 * Small, interpretable statistics used by every analysis. Deliberately simple: medians and MAD instead of means
 * (one bad night shouldn't move a baseline), Cliff's delta for group differences (no normality assumption,
 * readable as "how often one group beats the other"), and hard minimum sample sizes before anything is claimed.
 */

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Median absolute deviation, scaled (×1.4826) to be comparable to a standard deviation for normal data. */
export function mad(values: number[]): number | null {
  const m = median(values)
  if (m == null) return null
  return (median(values.map((v) => Math.abs(v - m))) ?? 0) * 1.4826
}

export interface RobustBaseline {
  median: number
  mad: number
  n: number
}

export const MIN_BASELINE_N = 14
export const DEVIATION_Z = 1.5

export function robustBaseline(values: number[], minN = MIN_BASELINE_N): RobustBaseline | null {
  const valid = values.filter(Number.isFinite)
  if (valid.length < minN) return null
  return { median: median(valid)!, mad: mad(valid)!, n: valid.length }
}

/** Robust z-score. A floor on the spread stops perfectly regular histories from turning tiny wobbles into "huge" deviations. */
export function robustZ(value: number, b: RobustBaseline, minSpread = 0): number {
  const spread = Math.max(b.mad, minSpread, 1e-9)
  return (value - b.median) / spread
}

export interface DayValue {
  day: string
  v: number | null
}

export type DeviationStatus = 'insufficient' | 'typical' | 'deviation' | 'sustained'

export interface DeviationPoint {
  day: string
  v: number | null
  baseline: RobustBaseline | null
  z: number | null
  status: DeviationStatus
}

/**
 * For each day, compares the value with a trailing baseline of the previous `windowDays` days (excluding that day).
 * "deviation" = |z| ≥ 1.5 today; "sustained" = at least 3 of the last 5 measured days deviate in the same direction.
 */
export function classifyDeviations(series: DayValue[], windowDays = 28, minSpread = 0): DeviationPoint[] {
  const out: DeviationPoint[] = []
  for (let i = 0; i < series.length; i++) {
    const { day, v } = series[i]
    const window = series.slice(Math.max(0, i - windowDays), i).map((p) => p.v).filter((x): x is number => x != null)
    const baseline = robustBaseline(window)
    if (v == null || !baseline) {
      out.push({ day, v, baseline, z: null, status: 'insufficient' })
      continue
    }
    const z = robustZ(v, baseline, minSpread)
    let status: DeviationStatus = Math.abs(z) >= DEVIATION_Z ? 'deviation' : 'typical'
    if (status === 'deviation') {
      const recent = [...out.slice(-4).filter((p) => p.z != null), { z }].slice(-5)
      const sameSide = recent.filter((p) => p.z != null && Math.abs(p.z) >= DEVIATION_Z && Math.sign(p.z) === Math.sign(z)).length
      if (sameSide >= 3) status = 'sustained'
    }
    out.push({ day, v, baseline, z, status })
  }
  return out
}

export type EffectMagnitude = 'negligible' | 'small' | 'medium' | 'large'

/** Cliff's delta: P(a > b) − P(a < b), in [−1, 1]. */
export function cliffsDelta(a: number[], b: number[]): number | null {
  if (a.length === 0 || b.length === 0) return null
  let gt = 0
  let lt = 0
  for (const x of a) {
    for (const y of b) {
      if (x > y) gt++
      else if (x < y) lt++
    }
  }
  return (gt - lt) / (a.length * b.length)
}

/** Romano et al. (2006) thresholds for Cliff's delta. */
export function magnitudeOf(delta: number): EffectMagnitude {
  const d = Math.abs(delta)
  if (d < 0.147) return 'negligible'
  if (d < 0.33) return 'small'
  if (d < 0.474) return 'medium'
  return 'large'
}

export type Evidence = 'insufficient' | 'weak' | 'moderate' | 'strong'

export const MIN_GROUP_N = 5

/**
 * Evidence quality from sample size and effect size — deliberately conservative. This is a rule of thumb for
 * personal observational data, not a significance test, and the UI says so.
 */
export function evidenceFor(nSmallestGroup: number, effect: number | null): Evidence {
  if (effect == null || nSmallestGroup < MIN_GROUP_N) return 'insufficient'
  const m = magnitudeOf(effect)
  if (m === 'negligible') return 'weak'
  if (nSmallestGroup >= 20 && (m === 'medium' || m === 'large')) return 'strong'
  if (nSmallestGroup >= 10 && m !== 'small') return 'moderate'
  return 'weak'
}

function ranks(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const r = new Array<number>(values.length)
  for (let k = 0; k < idx.length; ) {
    let j = k
    while (j + 1 < idx.length && idx[j + 1].v === idx[k].v) j++
    const avg = (k + j) / 2 + 1
    for (let m = k; m <= j; m++) r[idx[m].i] = avg
    k = j + 1
  }
  return r
}

/** Spearman rank correlation (handles ties). Null below 6 pairs. */
export function spearman(pairs: [number, number][]): { rho: number; n: number } | null {
  if (pairs.length < 6) return null
  const rx = ranks(pairs.map((p) => p[0]))
  const ry = ranks(pairs.map((p) => p[1]))
  const n = pairs.length
  const mx = rx.reduce((a, b) => a + b, 0) / n
  const my = ry.reduce((a, b) => a + b, 0) / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    cov += (rx[i] - mx) * (ry[i] - my)
    vx += (rx[i] - mx) ** 2
    vy += (ry[i] - my) ** 2
  }
  const d = Math.sqrt(vx * vy)
  return { rho: d === 0 ? 0 : cov / d, n }
}

/** Evidence for a rank correlation: needs n ≥ 8, and |rho| beyond what small samples produce by chance. */
export function correlationEvidence(rho: number, n: number): Evidence {
  if (n < 8) return 'insufficient'
  const a = Math.abs(rho)
  if (a < 0.2) return 'weak'
  if (n >= 30 && a >= 0.4) return 'strong'
  if (n >= 15 && a >= 0.3) return 'moderate'
  return 'weak'
}

/**
 * Splits items into "above" and "at or below" the median of `key`. With heavy ties at the median one side can end
 * up empty, so it then falls back to "at or above" vs "below". Callers must still check group sizes.
 */
export function splitAtMedian<T>(items: T[], key: (t: T) => number): { cut: number; high: T[]; low: T[] } | null {
  const m = median(items.map(key))
  if (m == null) return null
  let high = items.filter((t) => key(t) > m)
  let low = items.filter((t) => key(t) <= m)
  if (high.length === 0) {
    high = items.filter((t) => key(t) >= m)
    low = items.filter((t) => key(t) < m)
  }
  return { cut: m, high, low }
}
