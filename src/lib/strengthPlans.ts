import type { MuscleGroup } from './strength'

export type StrengthSplit = 'push' | 'pull' | 'legs' | 'full_body'

export interface ExerciseDef {
  name: string
  category: MuscleGroup
  /** Working weight for an intermediate lifter at fitness=1, in kg. Bodyweight moves use null. */
  baseWeightKg: number | null
  repRange: [number, number]
  sets: [number, number]
}

/** The subset of a seeded-RNG's interface this module needs. A plain Math.random-backed one (see `liveRng`) satisfies it too. */
export interface RngLike {
  range(min: number, max: number): number
  int(min: number, max: number): number
  gaussian(mean: number, stdDev: number): number
  chance(probability: number): boolean
  choice<T>(items: readonly T[]): T
}

/** Non-deterministic RNG for live, in-browser use (e.g. "quick-fill" a workout template). */
export function liveRng(): RngLike {
  return {
    range: (min, max) => min + Math.random() * (max - min),
    int: (min, max) => Math.floor(min + Math.random() * (max - min + 1)),
    gaussian: (mean, stdDev) => {
      const u1 = Math.max(Math.random(), 1e-9)
      const u2 = Math.random()
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      return mean + z * stdDev
    },
    chance: (probability) => Math.random() < probability,
    choice: (items) => items[Math.floor(Math.random() * items.length)],
  }
}

const PUSH: ExerciseDef[] = [
  { name: 'Barbell Bench Press', category: 'chest', baseWeightKg: 85, repRange: [5, 8], sets: [4, 5] },
  { name: 'Overhead Press', category: 'shoulders', baseWeightKg: 50, repRange: [6, 10], sets: [3, 4] },
  { name: 'Incline Dumbbell Press', category: 'chest', baseWeightKg: 30, repRange: [8, 12], sets: [3, 4] },
  { name: 'Lateral Raise', category: 'shoulders', baseWeightKg: 10, repRange: [10, 15], sets: [3, 3] },
  { name: 'Triceps Pushdown', category: 'arms', baseWeightKg: 35, repRange: [10, 14], sets: [3, 3] },
]

const PULL: ExerciseDef[] = [
  { name: 'Deadlift', category: 'back', baseWeightKg: 120, repRange: [3, 6], sets: [3, 4] },
  { name: 'Barbell Row', category: 'back', baseWeightKg: 70, repRange: [6, 10], sets: [4, 4] },
  { name: 'Lat Pulldown', category: 'back', baseWeightKg: 55, repRange: [8, 12], sets: [3, 4] },
  { name: 'Face Pull', category: 'shoulders', baseWeightKg: 20, repRange: [12, 15], sets: [3, 3] },
  { name: 'Barbell Curl', category: 'arms', baseWeightKg: 30, repRange: [8, 12], sets: [3, 4] },
]

const LEGS: ExerciseDef[] = [
  { name: 'Back Squat', category: 'legs', baseWeightKg: 100, repRange: [5, 8], sets: [4, 5] },
  { name: 'Romanian Deadlift', category: 'legs', baseWeightKg: 80, repRange: [6, 10], sets: [3, 4] },
  { name: 'Leg Press', category: 'legs', baseWeightKg: 160, repRange: [8, 12], sets: [3, 4] },
  { name: 'Walking Lunge', category: 'legs', baseWeightKg: 20, repRange: [10, 12], sets: [3, 3] },
  { name: 'Standing Calf Raise', category: 'legs', baseWeightKg: 60, repRange: [12, 16], sets: [3, 3] },
]

const FULL_BODY: ExerciseDef[] = [
  { name: 'Pull-Up', category: 'back', baseWeightKg: null, repRange: [6, 12], sets: [3, 4] },
  { name: 'Push-Up', category: 'chest', baseWeightKg: null, repRange: [12, 20], sets: [3, 3] },
  { name: 'Hanging Leg Raise', category: 'core', baseWeightKg: null, repRange: [8, 15], sets: [3, 3] },
  { name: 'Cable Crunch', category: 'core', baseWeightKg: 40, repRange: [12, 15], sets: [3, 3] },
  { name: 'Kettlebell Swing', category: 'legs', baseWeightKg: 24, repRange: [12, 20], sets: [3, 3] },
]

export const SPLIT_EXERCISES: Record<StrengthSplit, ExerciseDef[]> = {
  push: PUSH,
  pull: PULL,
  legs: LEGS,
  full_body: FULL_BODY,
}

export const SPLIT_NAMES: Record<StrengthSplit, string> = {
  push: 'Push Day',
  pull: 'Pull Day',
  legs: 'Leg Day',
  full_body: 'Full Body',
}

/** Every exercise this app knows about, deduplicated by name, for free-pick/autocomplete UI. */
export const EXERCISE_CATALOG: { name: string; category: MuscleGroup }[] = Array.from(
  new Map(
    [...PUSH, ...PULL, ...LEGS, ...FULL_BODY].map((e) => [e.name, { name: e.name, category: e.category }]),
  ).values(),
)

export interface PlannedSet {
  exercise: string
  category: MuscleGroup
  setOrder: number
  reps: number
  weightKg: number | null
  isWarmup: boolean
  restSec: number
}

/**
 * Builds a full workout's worth of sets for a split. `fitness` (0..1, typically rising over months of
 * training) drives progressive overload on loaded exercises; a small per-session jitter adds realistic
 * day-to-day variance. For live "quick-fill" use, pass fitness=1 and individualFactor tuned to the user.
 */
export function planStrengthWorkout(rng: RngLike, split: StrengthSplit, fitness: number, individualFactor: number): PlannedSet[] {
  const exercises = SPLIT_EXERCISES[split]
  const chosen = rng.chance(0.75) ? exercises : rng.choice([exercises.slice(0, 4), exercises.slice(1)])
  const sets: PlannedSet[] = []
  let order = 0

  for (const ex of chosen) {
    const numSets = rng.int(ex.sets[0], ex.sets[1])
    const sessionJitter = rng.gaussian(1, 0.03)
    const workingWeight =
      ex.baseWeightKg != null ? ex.baseWeightKg * individualFactor * (0.65 + fitness * 0.55) * sessionJitter : null

    if (ex.baseWeightKg != null && rng.chance(0.6)) {
      sets.push({
        exercise: ex.name,
        category: ex.category,
        setOrder: order++,
        reps: Math.round(rng.range(8, 10)),
        weightKg: workingWeight != null ? Math.round((workingWeight * 0.55) / 2.5) * 2.5 : null,
        isWarmup: true,
        restSec: rng.int(45, 75),
      })
    }

    for (let s = 0; s < numSets; s++) {
      const fatiguePerSet = 1 - s * rng.range(0.01, 0.03)
      const reps = Math.round(rng.range(ex.repRange[0], ex.repRange[1]) * (s === numSets - 1 ? rng.range(0.85, 1.05) : 1))
      const weight =
        workingWeight != null ? Math.max(2.5, Math.round((workingWeight * fatiguePerSet) / 2.5) * 2.5) : null
      sets.push({
        exercise: ex.name,
        category: ex.category,
        setOrder: order++,
        reps: Math.max(1, reps),
        weightKg: weight,
        isWarmup: false,
        restSec: ex.repRange[0] <= 6 ? rng.int(120, 180) : rng.int(60, 110),
      })
    }
  }

  return sets
}

export function pickSplit(rng: RngLike, lastSplit: StrengthSplit | null): StrengthSplit {
  const rotation: StrengthSplit[] = ['push', 'pull', 'legs']
  if (lastSplit && rng.chance(0.78)) {
    const idx = rotation.indexOf(lastSplit)
    if (idx >= 0) return rotation[(idx + 1) % rotation.length]
  }
  if (rng.chance(0.12)) return 'full_body'
  return rng.choice(rotation)
}
