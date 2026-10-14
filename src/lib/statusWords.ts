export type StatusLevel = 'low' | 'fair' | 'good' | 'optimal'

export const STATUS_LABELS: Record<StatusLevel, string> = {
  low: 'Low',
  fair: 'Fair',
  good: 'Good',
  optimal: 'Optimal',
}

export const STATUS_COLORS: Record<StatusLevel, string> = {
  low: '#fb4a59',
  fair: '#f5a623',
  good: '#34d399',
  optimal: '#38bdf8',
}

/** Higher is better (readiness, sleep score, energy/body battery, ...). */
export function statusForScore(value: number | null | undefined, thresholds: [number, number, number] = [40, 60, 80]): StatusLevel | null {
  if (value == null) return null
  if (value < thresholds[0]) return 'low'
  if (value < thresholds[1]) return 'fair'
  if (value < thresholds[2]) return 'good'
  return 'optimal'
}

/** Lower is better (stress, ...). */
export function statusForInverseScore(value: number | null | undefined, thresholds: [number, number, number] = [25, 50, 75]): StatusLevel | null {
  if (value == null) return null
  if (value < thresholds[0]) return 'optimal'
  if (value < thresholds[1]) return 'good'
  if (value < thresholds[2]) return 'fair'
  return 'low'
}
