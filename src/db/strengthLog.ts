import { openDB, type IDBPDatabase } from 'idb'
import type { MuscleGroup } from '../lib/strength'
import type { StrengthSplit } from '../lib/strengthPlans'

const DB_NAME = 'bettergarmin-strength-log'
const DB_VERSION = 1
const WORKOUTS_STORE = 'workouts'
const SETS_STORE = 'sets'

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
  personalRecord?: boolean
  side?: string | null
  technique?: string | null
  note?: string | null
}

export interface WorkoutWithSets extends WorkoutRecord {
  sets: SetRecord[]
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
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction([WORKOUTS_STORE, SETS_STORE], 'readwrite')
  await tx.objectStore(WORKOUTS_STORE).delete(workoutId)
  const setsStore = tx.objectStore(SETS_STORE)
  const index = setsStore.index('workoutId')
  let cursor = await index.openCursor(IDBKeyRange.only(workoutId))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
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
  const tx = db.transaction([WORKOUTS_STORE, SETS_STORE], 'readwrite')
  await tx.objectStore(WORKOUTS_STORE).clear()
  await tx.objectStore(SETS_STORE).clear()
  const workoutsStore = tx.objectStore(WORKOUTS_STORE)
  const setsStore = tx.objectStore(SETS_STORE)
  for (const w of workouts) await workoutsStore.put(w)
  for (const s of sets) await setsStore.put(s)
  await tx.done
}

/** Wipes every manually logged workout and set. Independent of "Forget my data" (that only clears imported GarminDB files). */
export async function clearAllWorkouts(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction([WORKOUTS_STORE, SETS_STORE], 'readwrite')
  await tx.objectStore(WORKOUTS_STORE).clear()
  await tx.objectStore(SETS_STORE).clear()
  await tx.done
}
