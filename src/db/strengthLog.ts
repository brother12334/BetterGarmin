import { openDB, type IDBPDatabase } from 'idb'
import type { MuscleGroup } from '../lib/strength'
import type { StrengthSplit } from '../lib/strengthPlans'
import { applyCorrections, type EffectiveSet, type SetFieldEdits } from './applyCorrections'

const DB_NAME = 'bettergarmin-strength-log'
const DB_VERSION = 2
const WORKOUTS_STORE = 'workouts'
const SETS_STORE = 'sets'
/** The untouched source file for each import, so corrections never destroy the original. */
const IMPORTS_STORE = 'imports'
/** User corrections layered on top of imported data (set boundaries, workout clock offset). */
const CORRECTIONS_STORE = 'corrections'

export interface ImportRecord {
  workoutId: string
  source: 'element26'
  importedAt: number
  fileName: string | null
  raw: unknown
}

export interface CorrectionRecord {
  /** `set:<setId>` or `workout:<workoutId>` */
  id: string
  workoutId: string
  setId?: string
  startMs?: number | null
  endMs?: number | null
  clockOffsetMs?: number
  /** Workout-level unit fix: every imported weight is multiplied by this. */
  weightScale?: number
  /** Set-level field edits (exercise, load, reps, warm-up, excluded). */
  fields?: SetFieldEdits
  editedAt: number
}

export interface WorkoutRecord {
  id: string
  day: string
  split: StrengthSplit | 'custom'
  notes: string | null
  /** Garmin activity_id for a strength session on the same day, if the watch logged one. */
  linkedActivityId: string | null
  createdAt: number
  /** 'manual' = typed in via the logger form (no reliable timestamps). 'element26' = imported, carries real set timestamps. */
  source?: 'manual' | 'element26'
  /** Precise workout window, epoch ms. Only present for imports with real timing data — required to build a timeline. */
  startedAtEpochMs?: number | null
  finishedAtEpochMs?: number | null
  gym?: string | null
  /** Subjective session rating, 1-5, as logged in the source app. */
  feelRating?: number | null
  qualityGrade?: string | null
  qualityPercent?: number | null
  /** Display name from the source app (e.g. a routine label like "Upper A"), distinct from the split taxonomy. */
  title?: string | null
}

export type SetType = 'warmup' | 'working' | 'drop' | 'superset' | 'failure'

export interface SetRecord {
  id: string
  workoutId: string
  day: string
  exercise: string
  category: MuscleGroup
  reps: number
  weight: number | null
  isWarmup: boolean
  order: number
  createdAt: number
  /** When this set was logged (epoch ms) — the only timestamp Element 26 actually records per set. Null for manual entries. */
  atEpochMs?: number | null
  /** Rest taken immediately before this set, in seconds, as reported by the source app (an app-tracked value, not independently measured). */
  restSecondsBefore?: number | null
  rpe?: number | null
  /** Reps in reserve, only when the source app recorded it. */
  rir?: number | null
  /** Derived from the source's warm-up flag and technique label; 'working' when nothing more specific is known. */
  setType?: SetType
  personalRecord?: boolean
  side?: string | null
  technique?: string | null
  note?: string | null
}

export interface WorkoutWithSets extends WorkoutRecord {
  /** Sets with the user's corrections applied (excluded sets removed). */
  sets: EffectiveSet[]
  clockOffsetMs?: number
}

const ALL_STORES = [WORKOUTS_STORE, SETS_STORE, IMPORTS_STORE, CORRECTIONS_STORE]

/** Fires after any write, so derived analyses can recompute instead of going stale. */
export const strengthLogEvents = new EventTarget()
let changeCounter = 0
export function strengthLogVersion(): number {
  return changeCounter
}
function notifyChanged() {
  changeCounter++
  strengthLogEvents.dispatchEvent(new Event('change'))
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(WORKOUTS_STORE)) {
          const store = db.createObjectStore(WORKOUTS_STORE, { keyPath: 'id' })
          store.createIndex('day', 'day')
        }
        if (!db.objectStoreNames.contains(SETS_STORE)) {
          const store = db.createObjectStore(SETS_STORE, { keyPath: 'id' })
          store.createIndex('workoutId', 'workoutId')
          store.createIndex('day', 'day')
        }
        if (!db.objectStoreNames.contains(IMPORTS_STORE)) {
          db.createObjectStore(IMPORTS_STORE, { keyPath: 'workoutId' })
        }
        if (!db.objectStoreNames.contains(CORRECTIONS_STORE)) {
          const store = db.createObjectStore(CORRECTIONS_STORE, { keyPath: 'id' })
          store.createIndex('workoutId', 'workoutId')
        }
      },
    })
  }
  return dbPromise
}

export async function saveWorkout(workout: WorkoutRecord, sets: SetRecord[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction([WORKOUTS_STORE, SETS_STORE], 'readwrite')
  await tx.objectStore(WORKOUTS_STORE).put(workout)
  const setsStore = tx.objectStore(SETS_STORE)
  for (const s of sets) await setsStore.put(s)
  await tx.done
  notifyChanged()
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction([WORKOUTS_STORE, SETS_STORE, IMPORTS_STORE, CORRECTIONS_STORE], 'readwrite')
  await tx.objectStore(WORKOUTS_STORE).delete(workoutId)
  await tx.objectStore(IMPORTS_STORE).delete(workoutId)
  for (const storeName of [SETS_STORE, CORRECTIONS_STORE] as const) {
    let cursor = await tx.objectStore(storeName).index('workoutId').openCursor(IDBKeyRange.only(workoutId))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
  }
  await tx.done
  notifyChanged()
}

export async function getAllWorkoutsWithSets(): Promise<WorkoutWithSets[]> {
  const db = await getDb()
  const [workouts, sets, corrections] = await Promise.all([
    db.getAll(WORKOUTS_STORE) as Promise<WorkoutRecord[]>,
    db.getAll(SETS_STORE) as Promise<SetRecord[]>,
    db.getAll(CORRECTIONS_STORE) as Promise<CorrectionRecord[]>,
  ])
  const setsByWorkout = new Map<string, SetRecord[]>()
  for (const s of sets) {
    const list = setsByWorkout.get(s.workoutId) ?? []
    list.push(s)
    setsByWorkout.set(s.workoutId, list)
  }
  const corrByWorkout = new Map<string, CorrectionRecord[]>()
  for (const c of corrections) corrByWorkout.set(c.workoutId, [...(corrByWorkout.get(c.workoutId) ?? []), c])
  return workouts
    .map((w) => effective(w, setsByWorkout.get(w.id) ?? [], corrByWorkout.get(w.id) ?? []))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.createdAt - a.createdAt))
}

export async function getWorkoutWithSets(workoutId: string): Promise<WorkoutWithSets | null> {
  const db = await getDb()
  const workout = (await db.get(WORKOUTS_STORE, workoutId)) as WorkoutRecord | undefined
  if (!workout) return null
  const [sets, corrections] = await Promise.all([
    db.getAllFromIndex(SETS_STORE, 'workoutId', workoutId) as Promise<SetRecord[]>,
    db.getAllFromIndex(CORRECTIONS_STORE, 'workoutId', workoutId) as Promise<CorrectionRecord[]>,
  ])
  return effective(workout, sets, corrections)
}

function effective(workout: WorkoutRecord, sets: SetRecord[], corrections: CorrectionRecord[]): WorkoutWithSets {
  const sorted = [...sets].sort((a, b) => a.order - b.order)
  const applied = applyCorrections(workout, sorted, corrections)
  return { ...workout, sets: applied.sets, clockOffsetMs: applied.settings.clockOffsetMs }
}

/** The imported sets exactly as stored, plus every correction — for the review screen. */
export async function getWorkoutForReview(workoutId: string): Promise<{ workout: WorkoutRecord; sets: SetRecord[]; corrections: CorrectionRecord[] } | null> {
  const db = await getDb()
  const workout = (await db.get(WORKOUTS_STORE, workoutId)) as WorkoutRecord | undefined
  if (!workout) return null
  const [sets, corrections] = await Promise.all([
    db.getAllFromIndex(SETS_STORE, 'workoutId', workoutId) as Promise<SetRecord[]>,
    db.getAllFromIndex(CORRECTIONS_STORE, 'workoutId', workoutId) as Promise<CorrectionRecord[]>,
  ])
  return { workout, sets: sets.sort((a, b) => a.order - b.order), corrections }
}

export async function hasAnyWorkouts(): Promise<boolean> {
  const db = await getDb()
  const count = await db.count(WORKOUTS_STORE)
  return count > 0
}

/** Bulk-loads demo workouts/sets, replacing whatever is currently stored. Used only for demo mode. */
export async function seedDemoWorkouts(workouts: WorkoutRecord[], sets: SetRecord[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(ALL_STORES, 'readwrite')
  for (const name of ALL_STORES) await tx.objectStore(name).clear()
  const workoutsStore = tx.objectStore(WORKOUTS_STORE)
  const setsStore = tx.objectStore(SETS_STORE)
  for (const w of workouts) await workoutsStore.put(w)
  for (const s of sets) await setsStore.put(s)
  await tx.done
  notifyChanged()
}

/** Wipes every manually logged workout and set. Independent of "Forget my data" (that only clears imported GarminDB files). */
export async function clearAllWorkouts(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(ALL_STORES, 'readwrite')
  for (const name of ALL_STORES) await tx.objectStore(name).clear()
  await tx.done
  notifyChanged()
}

/**
 * Saves an import: the normalized workout + sets, and the original file alongside them. Re-importing the same
 * workout replaces its sets (stale ones from the previous import are removed) but keeps the user's corrections
 * for sets whose ids still exist.
 */
export async function saveImportedWorkout(workout: WorkoutRecord, sets: SetRecord[], source: ImportRecord): Promise<{ replaced: boolean }> {
  const db = await getDb()
  const tx = db.transaction([WORKOUTS_STORE, SETS_STORE, IMPORTS_STORE], 'readwrite')
  const replaced = (await tx.objectStore(WORKOUTS_STORE).get(workout.id)) != null
  const setsStore = tx.objectStore(SETS_STORE)
  const keep = new Set(sets.map((s) => s.id))
  let cursor = await setsStore.index('workoutId').openCursor(IDBKeyRange.only(workout.id))
  while (cursor) {
    if (!keep.has((cursor.value as SetRecord).id)) await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.objectStore(WORKOUTS_STORE).put(workout)
  for (const s of sets) await setsStore.put(s)
  await tx.objectStore(IMPORTS_STORE).put(source)
  await tx.done
  notifyChanged()
  return { replaced }
}

export async function getImportRecord(workoutId: string): Promise<ImportRecord | null> {
  const db = await getDb()
  return ((await db.get(IMPORTS_STORE, workoutId)) as ImportRecord | undefined) ?? null
}

export async function getCorrections(workoutId: string): Promise<CorrectionRecord[]> {
  const db = await getDb()
  return (await db.getAllFromIndex(CORRECTIONS_STORE, 'workoutId', workoutId)) as CorrectionRecord[]
}

/** Read-modify-write of one correction record; deleted when nothing meaningful is left in it. */
async function updateCorrection(id: string, workoutId: string, patch: (c: CorrectionRecord) => CorrectionRecord): Promise<void> {
  const db = await getDb()
  const existing = ((await db.get(CORRECTIONS_STORE, id)) as CorrectionRecord | undefined) ?? { id, workoutId, editedAt: 0 }
  const next = { ...patch(existing), editedAt: Date.now() }
  const fieldsEmpty = !next.fields || Object.values(next.fields).every((v) => v === undefined)
  const empty =
    next.startMs == null && next.endMs == null && fieldsEmpty && (next.clockOffsetMs ?? 0) === 0 && (next.weightScale ?? 1) === 1
  if (empty) await db.delete(CORRECTIONS_STORE, id)
  else await db.put(CORRECTIONS_STORE, next)
  notifyChanged()
}

export async function saveSetCorrection(workoutId: string, setId: string, startMs: number | null, endMs: number | null): Promise<void> {
  await updateCorrection(`set:${setId}`, workoutId, (c) => ({ ...c, setId, startMs, endMs }))
}

/** Pass `undefined` for a field to clear that edit; `null` clears all field edits for the set. */
export async function saveSetFields(workoutId: string, setId: string, fields: SetFieldEdits | null): Promise<void> {
  await updateCorrection(`set:${setId}`, workoutId, (c) => {
    if (fields == null) return { ...c, setId, fields: undefined }
    const merged = { ...c.fields, ...fields }
    for (const k of Object.keys(merged) as (keyof SetFieldEdits)[]) if (merged[k] === undefined) delete merged[k]
    return { ...c, setId, fields: Object.keys(merged).length ? merged : undefined }
  })
}

export async function saveClockOffset(workoutId: string, clockOffsetMs: number): Promise<void> {
  await updateCorrection(`workout:${workoutId}`, workoutId, (c) => ({ ...c, clockOffsetMs }))
}

export async function saveWeightScale(workoutId: string, weightScale: number): Promise<void> {
  await updateCorrection(`workout:${workoutId}`, workoutId, (c) => ({ ...c, weightScale }))
}

/** Drops every field edit and the unit fix for a workout (timing corrections and clock offset are kept). */
export async function resetWorkoutEdits(workoutId: string): Promise<void> {
  const db = await getDb()
  const all = (await db.getAllFromIndex(CORRECTIONS_STORE, 'workoutId', workoutId)) as CorrectionRecord[]
  for (const c of all) {
    if (c.setId && c.fields) await updateCorrection(c.id, workoutId, (x) => ({ ...x, fields: undefined }))
    if (c.id === `workout:${workoutId}` && (c.weightScale ?? 1) !== 1) await updateCorrection(c.id, workoutId, (x) => ({ ...x, weightScale: 1 }))
  }
}

/** Every raw record in the strength log (workouts, sets, original imports, corrections), for a backup file. */
export async function exportStrengthLog(): Promise<Record<string, unknown[]>> {
  const db = await getDb()
  const out: Record<string, unknown[]> = {}
  for (const name of ALL_STORES) out[name] = await db.getAll(name)
  return out
}

/** Restores a backup made by exportStrengthLog. Records with the same ID are replaced; nothing else is removed. */
export async function importStrengthLog(data: Record<string, unknown[]>): Promise<number> {
  const db = await getDb()
  const tx = db.transaction(ALL_STORES, 'readwrite')
  let n = 0
  for (const name of ALL_STORES) {
    for (const rec of data[name] ?? []) {
      await tx.objectStore(name).put(rec)
      n++
    }
  }
  await tx.done
  notifyChanged()
  return n
}
