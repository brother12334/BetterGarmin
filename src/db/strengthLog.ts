import { openDB, type IDBPDatabase } from 'idb'
import type { MuscleGroup } from '../lib/strength'
import type { StrengthSplit } from '../lib/strengthPlans'

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
  sets: SetRecord[]
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
  const [workouts, sets] = await Promise.all([db.getAll(WORKOUTS_STORE) as Promise<WorkoutRecord[]>, db.getAll(SETS_STORE) as Promise<SetRecord[]>])
  const setsByWorkout = new Map<string, SetRecord[]>()
  for (const s of sets) {
    const list = setsByWorkout.get(s.workoutId) ?? []
    list.push(s)
    setsByWorkout.set(s.workoutId, list)
  }
  return workouts
    .map((w) => ({ ...w, sets: (setsByWorkout.get(w.id) ?? []).sort((a, b) => a.order - b.order) }))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.createdAt - a.createdAt))
}

export async function getWorkoutWithSets(workoutId: string): Promise<WorkoutWithSets | null> {
  const db = await getDb()
  const workout = (await db.get(WORKOUTS_STORE, workoutId)) as WorkoutRecord | undefined
  if (!workout) return null
  const sets = ((await db.getAllFromIndex(SETS_STORE, 'workoutId', workoutId)) as SetRecord[]).sort((a, b) => a.order - b.order)
  return { ...workout, sets }
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

export async function saveSetCorrection(workoutId: string, setId: string, startMs: number | null, endMs: number | null): Promise<void> {
  const db = await getDb()
  const id = `set:${setId}`
  if (startMs == null && endMs == null) {
    await db.delete(CORRECTIONS_STORE, id)
    notifyChanged()
    return
  }
  const record: CorrectionRecord = { id, workoutId, setId, startMs, endMs, editedAt: Date.now() }
  await db.put(CORRECTIONS_STORE, record)
  notifyChanged()
}

export async function saveClockOffset(workoutId: string, clockOffsetMs: number): Promise<void> {
  const db = await getDb()
  const id = `workout:${workoutId}`
  if (clockOffsetMs === 0) {
    await db.delete(CORRECTIONS_STORE, id)
    notifyChanged()
    return
  }
  const record: CorrectionRecord = { id, workoutId, clockOffsetMs, editedAt: Date.now() }
  await db.put(CORRECTIONS_STORE, record)
  notifyChanged()
}
