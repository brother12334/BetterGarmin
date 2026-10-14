/** Muscle-group categories used to tag strength exercises. */
export type MuscleGroup = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core'

export const MUSCLE_GROUPS: MuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core']

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
}

export const MUSCLE_GROUP_COLORS: Record<MuscleGroup, string> = {
  chest: '#fb4a59',
  back: '#38bdf8',
  legs: '#34d399',
  shoulders: '#f5a623',
  arms: '#a78bfa',
  core: '#ec4899',
}

export interface SetEntry {
  exercise: string
  category: MuscleGroup
  reps: number
  weight: number | null
  isWarmup?: boolean
}

/** Epley formula: a standard, widely-used estimate of a one-rep max from a lighter, higher-rep set. */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (reps <= 1) return weight
  return weight * (1 + reps / 30)
}

/** Total volume (weight x reps) for a set. Bodyweight sets (null weight) contribute 0 to load-based volume. */
export function setVolume(weight: number | null, reps: number): number {
  return (weight ?? 0) * reps
}

export function bestSet(sets: { weight: number | null; reps: number }[]): { weight: number; reps: number; e1rm: number } | null {
  let best: { weight: number; reps: number; e1rm: number } | null = null
  for (const s of sets) {
    if (s.weight == null || s.weight <= 0) continue
    const e1rm = estimateOneRepMax(s.weight, s.reps)
    if (!best || e1rm > best.e1rm) best = { weight: s.weight, reps: s.reps, e1rm }
  }
  return best
}
