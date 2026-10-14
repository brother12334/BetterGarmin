/**
 * BetterGarmin's Readiness/Recovery score — not a Garmin value, GarminDB has
 * no equivalent. Combines four inputs, each normalized to 0-100 and
 * weighted, following the general approach used by published readiness
 * models (e.g. Whoop's Recovery score, Oura's Readiness score): recent
 * sleep quality, resting heart rate relative to your own baseline, recent
 * training strain (Banister Form), and today's stress relative to your own
 * baseline. Weights are adjustable; defaults below.
 */

import type { Baseline } from './baselines'
import { zScore } from './baselines'

export interface ReadinessInputs {
  sleepScore: number | null
  restingHr: number | null
  restingHrBaseline: Baseline | null
  form: number | null
  /** Typical range of recent form values, for normalizing form onto 0-100. */
  formBaseline: Baseline | null
  stressAvg: number | null
  stressBaseline: Baseline | null
}

export interface ReadinessWeights {
  sleep: number
  restingHr: number
  form: number
  stress: number
}

export const DEFAULT_READINESS_WEIGHTS: ReadinessWeights = {
  sleep: 0.4,
  restingHr: 0.25,
  form: 0.2,
  stress: 0.15,
}

export interface ReadinessResult {
  score: number
  recommendation: string
  components: {
    sleep: number | null
    restingHr: number | null
    form: number | null
    stress: number | null
  }
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

/** Lower RHR than your baseline is better; convert a z-score into a 0-100 "goodness" score. */
function scoreFromInverseZ(value: number | null, baseline: Baseline | null): number | null {
  if (value == null || baseline == null || baseline.n < 5) return null
  const z = zScore(value, baseline)
  return clamp(50 - z * 20)
}

function scoreFromZ(value: number | null, baseline: Baseline | null): number | null {
  if (value == null || baseline == null || baseline.n < 5) return null
  const z = zScore(value, baseline)
  return clamp(50 + z * 20)
}

export function computeReadiness(
  inputs: ReadinessInputs,
  weights: ReadinessWeights = DEFAULT_READINESS_WEIGHTS,
): ReadinessResult {
  const sleepComponent = inputs.sleepScore
  const restingHrComponent = scoreFromInverseZ(inputs.restingHr, inputs.restingHrBaseline)
  const formComponent = scoreFromZ(inputs.form, inputs.formBaseline)
  // Higher stress than your baseline is worse, so invert.
  const stressComponent = scoreFromInverseZ(inputs.stressAvg, inputs.stressBaseline)

  const parts: { value: number; weight: number }[] = []
  if (sleepComponent != null) parts.push({ value: sleepComponent, weight: weights.sleep })
  if (restingHrComponent != null) parts.push({ value: restingHrComponent, weight: weights.restingHr })
  if (formComponent != null) parts.push({ value: formComponent, weight: weights.form })
  if (stressComponent != null) parts.push({ value: stressComponent, weight: weights.stress })

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
  const score = totalWeight > 0 ? Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight) : 50

  let recommendation: string
  if (score >= 80) recommendation = 'Good day for a hard workout.'
  else if (score >= 60) recommendation = 'Normal training day — your body is handling your current load well.'
  else if (score >= 40) recommendation = 'Consider an easier session today.'
  else recommendation = 'Prioritize recovery — an easy day or rest looks like the better call.'

  return {
    score,
    recommendation,
    components: {
      sleep: sleepComponent,
      restingHr: restingHrComponent,
      form: formComponent,
      stress: stressComponent,
    },
  }
}
