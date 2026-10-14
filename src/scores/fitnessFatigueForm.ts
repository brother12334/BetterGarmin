/**
 * Banister Impulse-Response model (Banister, E.W. et al. 1975, "A systems
 * model of training for athletic performance", Australian Journal of Sports
 * Medicine 7:57-61), as popularized by the CTL/ATL/TSB "Performance
 * Management Chart" methodology (Coggan, TrainingPeaks).
 *
 * Fitness (CTL-like): exponentially-weighted daily training load, 42-day
 * time constant — builds slowly, decays slowly.
 * Fatigue (ATL-like): same, but a 7-day time constant — reacts fast.
 * Form = Fitness - Fatigue. Positive form means you're fresh; very negative
 * form means accumulated fatigue is high relative to fitness.
 */

export interface FitnessFatiguePoint {
  day: string
  load: number
  fitness: number
  fatigue: number
  form: number
}

const FITNESS_TIME_CONSTANT = 42
const FATIGUE_TIME_CONSTANT = 7

function emaStep(previous: number, load: number, timeConstant: number): number {
  const alpha = 1 - Math.exp(-1 / timeConstant)
  return previous + (load - previous) * alpha
}

/** Expects one point per calendar day, consecutive, oldest first, 0 load on rest days. */
export function computeFitnessFatigueForm(daily: { day: string; load: number }[]): FitnessFatiguePoint[] {
  let fitness = 0
  let fatigue = 0
  const out: FitnessFatiguePoint[] = []
  for (const point of daily) {
    fitness = emaStep(fitness, point.load, FITNESS_TIME_CONSTANT)
    fatigue = emaStep(fatigue, point.load, FATIGUE_TIME_CONSTANT)
    out.push({ day: point.day, load: point.load, fitness, fatigue, form: fitness - fatigue })
  }
  return out
}
