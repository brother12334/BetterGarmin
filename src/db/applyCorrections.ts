import type { MuscleGroup } from '../lib/strength'
import type { CorrectionRecord, SetRecord, WorkoutRecord } from './strengthLog'

/** Field-level edits a user can make to an imported set. The stored set itself is never modified. */
export interface SetFieldEdits {
  exercise?: string
  category?: MuscleGroup
  /** Kilograms. An explicit weight edit takes precedence over a workout-level unit fix. */
  weight?: number | null
  reps?: number
  isWarmup?: boolean
  /** Excluded sets (e.g. duplicates) disappear from every analysis but stay in the review screen. */
  excluded?: boolean
}

export type EditableField = keyof SetFieldEdits

export interface EffectiveSet extends SetRecord {
  /** Which fields differ from the imported value. Empty/undefined = untouched. */
  editedFields?: EditableField[]
}

export interface EffectiveWorkout {
  clockOffsetMs: number
  /** Multiplier applied to every imported weight (e.g. 0.4536 when a file said kg but held pounds). 1 = none. */
  weightScale: number
}

export function workoutSettings(corrections: CorrectionRecord[], workoutId: string): EffectiveWorkout {
  const w = corrections.find((c) => c.id === `workout:${workoutId}`)
  return { clockOffsetMs: w?.clockOffsetMs ?? 0, weightScale: w?.weightScale ?? 1 }
}

/** Applies a workout's corrections to its imported sets. Excluded sets are returned separately. */
export function applyCorrections(
  workout: WorkoutRecord,
  sets: SetRecord[],
  corrections: CorrectionRecord[],
): { sets: EffectiveSet[]; excluded: EffectiveSet[]; settings: EffectiveWorkout } {
  const settings = workoutSettings(corrections, workout.id)
  const bySet = new Map(corrections.filter((c) => c.setId).map((c) => [c.setId as string, c.fields]))
  const out: EffectiveSet[] = []
  const excluded: EffectiveSet[] = []
  for (const s of sets) {
    const f = bySet.get(s.id) ?? {}
    const edited: EditableField[] = []
    const e: EffectiveSet = { ...s }
    if (settings.weightScale !== 1 && s.weight != null) e.weight = Math.round(s.weight * settings.weightScale * 100) / 100
    if (f.exercise != null && f.exercise !== s.exercise) {
      e.exercise = f.exercise
      edited.push('exercise')
    }
    if (f.category != null && f.category !== s.category) {
      e.category = f.category
      edited.push('category')
    }
    if (f.weight !== undefined && f.weight !== s.weight) {
      e.weight = f.weight
      edited.push('weight')
    }
    if (f.reps != null && f.reps !== s.reps) {
      e.reps = f.reps
      edited.push('reps')
    }
    if (f.isWarmup != null && f.isWarmup !== s.isWarmup) {
      e.isWarmup = f.isWarmup
      e.setType = f.isWarmup ? 'warmup' : s.setType === 'warmup' ? 'working' : s.setType
      edited.push('isWarmup')
    }
    if (edited.length) e.editedFields = edited
    if (f.excluded) excluded.push({ ...e, editedFields: [...edited, 'excluded'] })
    else out.push(e)
  }
  return { sets: out, excluded, settings }
}

/**
 * Likely duplicate sets: same exercise, load and reps logged within 10 s of an earlier one (a double tap in the
 * logging app). Returns the ids of the later copies.
 */
export function findLikelyDuplicates(sets: SetRecord[]): Set<string> {
  const dupes = new Set<string>()
  const timed = sets.filter((s) => s.atEpochMs != null).sort((a, b) => (a.atEpochMs as number) - (b.atEpochMs as number))
  for (let i = 1; i < timed.length; i++) {
    for (let j = i - 1; j >= 0 && (timed[i].atEpochMs as number) - (timed[j].atEpochMs as number) <= 10_000; j--) {
      const a = timed[j]
      const b = timed[i]
      if (a.exercise === b.exercise && a.weight === b.weight && a.reps === b.reps) {
        dupes.add(b.id)
        break
      }
    }
  }
  return dupes
}
