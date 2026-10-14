/**
 * BetterGarmin's own "Energy Reserve" estimate — NOT Garmin's trademarked
 * Body Battery, and not a reproduction of Firstbeat's proprietary algorithm
 * (GarminDB only exposes Garmin's own daily min/max/charged values, not an
 * intraday curve). This is a simplified, openly-documented stand-in built on
 * the general physiological principle that parasympathetic-dominant
 * (low-stress) periods allow recovery while sympathetic-dominant (high
 * stress) periods deplete it — see e.g. Plews et al. (2013), "Training
 * Adaptation and Heart Rate Variability in Elite Endurance Athletes",
 * Sports Medicine 43(9). Treat this as a labeled estimate, not a clinical
 * measurement.
 *
 * Model: walk the day's stress samples in order; at each step, charge or
 * drain proportionally to elapsed minutes and the stress band of that
 * sample, clamped to 0-100.
 */

export interface StressSample {
  timestamp: string
  stress: number | null
}

export interface EnergyPoint {
  timestamp: string
  value: number
  rate: number
}

export interface EnergySegment {
  startTimestamp: string
  endTimestamp: string
  delta: number
}

function parseTs(ts: string): number {
  return new Date(ts.replace(' ', 'T')).getTime()
}

/** Garmin sometimes reports negative sentinel stress values for rest/sleep states — treat as deeply recuperative. */
function ratePerMinuteForStress(stress: number): number {
  if (stress < 0) return 0.07
  if (stress < 25) return 0.05
  if (stress < 50) return 0.01
  if (stress < 75) return -0.04
  return -0.09
}

export function computeEnergyReserveCurve(stressSamples: StressSample[], startValue = 50): EnergyPoint[] {
  const sorted = [...stressSamples]
    .filter((s) => s.stress != null)
    .sort((a, b) => parseTs(a.timestamp) - parseTs(b.timestamp))
  if (sorted.length === 0) return []

  let value = Math.max(0, Math.min(100, startValue))
  const out: EnergyPoint[] = []
  let prevTime = parseTs(sorted[0].timestamp)

  for (const sample of sorted) {
    const curTime = parseTs(sample.timestamp)
    const dtMin = Math.max(0, (curTime - prevTime) / 60000)
    const rate = ratePerMinuteForStress(sample.stress as number)
    value = Math.max(0, Math.min(100, value + rate * dtMin))
    out.push({ timestamp: sample.timestamp, value: Math.round(value * 10) / 10, rate })
    prevTime = curTime
  }
  return out
}

/** Largest contiguous drain and largest contiguous recharge, via a Kadane-style scan over deltas. */
export function findBiggestSegments(curve: EnergyPoint[]): { biggestDrain: EnergySegment | null; bestRecharge: EnergySegment | null } {
  if (curve.length < 2) return { biggestDrain: null, bestRecharge: null }

  function scan(sign: 1 | -1): EnergySegment | null {
    let bestSum = 0
    let bestStart = -1
    let bestEnd = -1
    let curSum = 0
    let curStart = 0
    for (let i = 1; i < curve.length; i++) {
      const delta = (curve[i].value - curve[i - 1].value) * sign
      if (curSum <= 0) {
        curSum = delta
        curStart = i - 1
      } else {
        curSum += delta
      }
      if (curSum > bestSum) {
        bestSum = curSum
        bestStart = curStart
        bestEnd = i
      }
    }
    if (bestStart === -1) return null
    return {
      startTimestamp: curve[bestStart].timestamp,
      endTimestamp: curve[bestEnd].timestamp,
      delta: sign * bestSum,
    }
  }

  return { biggestDrain: scan(-1), bestRecharge: scan(1) }
}
