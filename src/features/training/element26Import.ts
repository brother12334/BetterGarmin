import type { MuscleGroup } from '../../lib/strength'
import { EXERCISE_CATALOG } from '../../lib/strengthPlans'
import type { SetRecord, SetType, WorkoutRecord } from '../../db/strengthLog'

const LB_TO_KG = 0.45359237

interface Element26Set {
  set: number
  done?: boolean
  weight?: number | null
  reps?: number | null
  rpe?: number | null
  rir?: number | null
  warmup?: boolean
  side?: string | null
  technique?: string | null
  personalRecord?: boolean
  note?: string | null
  restSeconds?: number | null
  at?: string | null
  atEpochMs?: number | null
}

interface Element26Exercise {
  order?: number
  exercise?: string
  sets?: Element26Set[]
}

interface Element26Export {
  format?: string
  formatVersion?: number
  units?: string
  workout?: {
    id?: string
    day?: string | null
    date?: string | null
    startedAt?: string
    finishedAt?: string
    gym?: string | null
    feel?: number | null
    note?: string | null
    quality?: { grade?: string | null; percent?: number | null } | null
  }
  exercises?: Element26Exercise[]
}

export interface ParsedElement26Workout {
  workout: WorkoutRecord
  sets: SetRecord[]
  /** Non-fatal issues worth surfacing (e.g. a set with no usable timestamp was skipped). */
  warnings: string[]
}

/** Keyword fallback for exercise names Element 26 might log that aren't in our built-in catalog. */
function guessCategory(name: string): MuscleGroup {
  const n = name.toLowerCase()
  const exact = EXERCISE_CATALOG.find((e) => e.name.toLowerCase() === n)
  if (exact) return exact.category
  const partial = EXERCISE_CATALOG.find((e) => n.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(n))
  if (partial) return partial.category

  if (/squat|lunge|leg press|calf|hamstring|quad|glute|hip thrust|leg curl|leg extension/.test(n)) return 'legs'
  if (/(^|\s)(bench|chest|fly|push-?up)(\s|$)/.test(n) && !/overhead|shoulder/.test(n)) return 'chest'
  if (/row|pulldown|pull-?up|chin-?up|lat |deadlift/.test(n)) return 'back'
  if (/overhead press|shoulder press|military press|lateral raise|front raise|face pull|arnold|delt/.test(n)) return 'shoulders'
  if (/curl|tricep|skull ?crusher|pushdown|kickback/.test(n)) return 'arms'
  if (/crunch|sit-?up|plank|leg raise|ab |core|russian twist/.test(n)) return 'core'
  return 'core'
}

function setTypeFor(s: Element26Set): SetType {
  if (s.warmup === true) return 'warmup'
  const t = (s.technique ?? '').toLowerCase()
  if (/drop/.test(t)) return 'drop'
  if (/super/.test(t)) return 'superset'
  if (/fail/.test(t)) return 'failure'
  return 'working'
}

function parseTimestamp(set: Element26Set): number | null {
  if (typeof set.atEpochMs === 'number' && Number.isFinite(set.atEpochMs)) return set.atEpochMs
  if (set.at) {
    const t = new Date(set.at).getTime()
    if (Number.isFinite(t)) return t
  }
  return null
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function parseElement26Export(raw: unknown): ParsedElement26Workout | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'That file is not valid JSON.' }
  const data = raw as Element26Export

  if (typeof data.format === 'string' && !data.format.toLowerCase().includes('element26')) {
    return { error: `This doesn't look like an Element 26 export (format: "${data.format}").` }
  }
  const w = data.workout
  if (!w || !w.startedAt || !w.finishedAt) {
    return { error: "This file is missing the workout's start/end time — can't build a timeline without it." }
  }
  const startedAtEpochMs = new Date(w.startedAt).getTime()
  const finishedAtEpochMs = new Date(w.finishedAt).getTime()
  if (!Number.isFinite(startedAtEpochMs) || !Number.isFinite(finishedAtEpochMs)) {
    return { error: "Couldn't parse the workout's start/end timestamps." }
  }

  const unitsLower = (data.units ?? 'kg').toLowerCase()
  const weightToKg = (value: number | null | undefined): number | null => {
    if (value == null) return null
    return unitsLower === 'lb' || unitsLower === 'lbs' ? Math.round(value * LB_TO_KG * 100) / 100 : value
  }

  const day = w.date ?? new Date(startedAtEpochMs).toISOString().slice(0, 10)
  const workoutId = `e26-${w.id ?? newId()}`
  const createdAt = Date.now()

  const warnings: string[] = []
  const sets: SetRecord[] = []
  let order = 0

  for (const ex of data.exercises ?? []) {
    const exerciseName = ex.exercise?.trim()
    if (!exerciseName) continue
    const category = guessCategory(exerciseName)
    for (const s of ex.sets ?? []) {
      if (s.done === false) continue // not actually performed
      if (s.reps == null) continue
      const atEpochMs = parseTimestamp(s)
      if (atEpochMs == null) {
        warnings.push(`${exerciseName} set ${s.set}: no usable timestamp, included without timing.`)
      }
      sets.push({
        id: `${workoutId}-${order}`,
        workoutId,
        day,
        exercise: exerciseName,
        category,
        reps: s.reps,
        weight: weightToKg(s.weight),
        isWarmup: s.warmup === true,
        order: order++,
        createdAt,
        atEpochMs,
        restSecondsBefore: s.restSeconds ?? null,
        rpe: s.rpe ?? null,
        rir: s.rir ?? null,
        setType: setTypeFor(s),
        personalRecord: s.personalRecord === true,
        side: s.side ?? null,
        technique: s.technique ?? null,
        note: s.note ?? null,
      })
    }
  }

  if (sets.length === 0) return { error: 'No completed sets were found in this file.' }

  if (!['kg', 'lb', 'lbs'].includes(unitsLower)) {
    warnings.push(`Unrecognized weight unit "${data.units}" — weights were kept as-is and treated as kg. Check them.`)
  }
  const timedSets = sets.filter((s) => s.atEpochMs != null)
  const outside = timedSets.filter((s) => (s.atEpochMs as number) < startedAtEpochMs || (s.atEpochMs as number) > finishedAtEpochMs)
  if (outside.length > 0) {
    warnings.push(`${outside.length} set(s) were logged outside the workout's start/end time — they'll be clamped on the timeline.`)
  }
  for (let i = 1; i < timedSets.length; i++) {
    if ((timedSets[i].atEpochMs as number) < (timedSets[i - 1].atEpochMs as number)) {
      warnings.push('Set timestamps are not in the same order as the exercises/sets — the timeline orders sets by time.')
      break
    }
  }
  const seen = new Set<number>()
  let dupes = 0
  for (const s of timedSets) {
    if (seen.has(s.atEpochMs as number)) dupes++
    seen.add(s.atEpochMs as number)
  }
  if (dupes > 0) warnings.push(`${dupes} set(s) share an identical timestamp with another set.`)

  const workout: WorkoutRecord = {
    id: workoutId,
    day,
    split: 'custom',
    notes: w.note ?? null,
    linkedActivityId: null,
    createdAt,
    source: 'element26',
    startedAtEpochMs,
    finishedAtEpochMs,
    gym: w.gym ?? null,
    feelRating: w.feel ?? null,
    qualityGrade: w.quality?.grade ?? null,
    qualityPercent: w.quality?.percent ?? null,
    title: w.day ?? null,
  }

  return { workout, sets, warnings }
}
