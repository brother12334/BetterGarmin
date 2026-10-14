/**
 * Acute:Chronic Workload Ratio (ACWR) — Gabbett, T.J. (2016), "The training—injury
 * prevention paradox: should athletes be training smarter and harder?",
 * British Journal of Sports Medicine 50(5):273-280.
 *
 * Acute load = trailing 7-day average daily training load.
 * Chronic load = trailing 28-day average daily training load.
 * ACWR = acute / chronic.
 */

export type TrainingStatus = 'detraining' | 'maintaining' | 'productive' | 'overreaching'

export interface DailyLoadPoint {
  day: string
  load: number
}

export interface TrainingLoadPoint extends DailyLoadPoint {
  acute: number
  chronic: number
  acwr: number | null
  status: TrainingStatus | null
}

export const TRAINING_STATUS_LABEL: Record<TrainingStatus, string> = {
  detraining: 'Detraining',
  maintaining: 'Maintaining',
  productive: 'Productive',
  overreaching: 'Overreaching',
}

export const TRAINING_STATUS_DESCRIPTION: Record<TrainingStatus, string> = {
  detraining: 'Your recent training load is well below your usual — fitness may be gradually declining.',
  maintaining: 'Your training load is close to your typical balance of acute and chronic load.',
  productive: 'Your acute load is comfortably elevated over chronic — a good zone for building fitness.',
  overreaching: 'Your acute load has climbed sharply above chronic — elevated injury/fatigue risk if sustained.',
}

function statusFor(acwr: number): TrainingStatus {
  if (acwr < 0.8) return 'detraining'
  if (acwr <= 1.3) return 'maintaining'
  if (acwr <= 1.5) return 'productive'
  return 'overreaching'
}

/** Expects one point per calendar day, consecutive, oldest first, 0 load on rest days. */
export function computeTrainingLoad(daily: DailyLoadPoint[]): TrainingLoadPoint[] {
  const out: TrainingLoadPoint[] = []
  for (let i = 0; i < daily.length; i++) {
    const acuteWindow = daily.slice(Math.max(0, i - 6), i + 1)
    const chronicWindow = daily.slice(Math.max(0, i - 27), i + 1)
    const acute = acuteWindow.reduce((s, d) => s + d.load, 0) / acuteWindow.length
    const chronic = chronicWindow.reduce((s, d) => s + d.load, 0) / chronicWindow.length
    const hasEnoughHistory = chronicWindow.length >= 14
    const acwr = hasEnoughHistory && chronic > 0 ? acute / chronic : null
    out.push({
      ...daily[i],
      acute,
      chronic,
      acwr,
      status: acwr != null ? statusFor(acwr) : null,
    })
  }
  return out
}
