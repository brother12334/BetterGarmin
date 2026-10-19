import { useEffect, useState } from 'react'
import type { MuscleGroup } from '../../lib/strength'
import type { WorkoutWithSets } from '../../db/strengthLog'

/** Saved workout routines: exercises with target sets, reps and weight. Stored on this device. */

export interface RoutineExercise {
  id: string
  name: string
  category: MuscleGroup
  sets: number
  reps: number
  /** Kilograms; null = bodyweight or not set. */
  weight: number | null
}

export interface Routine {
  id: string
  name: string
  pinned: boolean
  exercises: RoutineExercise[]
  updatedAt: number
}

const KEY = 'bettergarmin:routines'
export const routineEvents = new EventTarget()

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function loadRoutines(): Routine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveRoutines(list: Routine[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
  routineEvents.dispatchEvent(new Event('change'))
}

export function upsertRoutine(r: Routine) {
  const list = loadRoutines()
  const i = list.findIndex((x) => x.id === r.id)
  if (i >= 0) list[i] = { ...r, updatedAt: Date.now() }
  else list.push({ ...r, updatedAt: Date.now() })
  saveRoutines(list)
}

export function duplicateRoutine(id: string): Routine | null {
  const list = loadRoutines()
  const src = list.find((r) => r.id === id)
  if (!src) return null
  const copy: Routine = { ...src, id: newId(), name: `${src.name} (copy)`, pinned: false, exercises: src.exercises.map((e) => ({ ...e, id: newId() })), updatedAt: Date.now() }
  list.splice(list.indexOf(src) + 1, 0, copy)
  saveRoutines(list)
  return copy
}

export function moveRoutine(id: string, delta: -1 | 1) {
  const list = loadRoutines()
  const i = list.findIndex((r) => r.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  saveRoutines(list)
}

export function deleteRoutine(id: string) {
  saveRoutines(loadRoutines().filter((r) => r.id !== id))
}

/** Pinned first, otherwise the user's order. */
export function sortedRoutines(list: Routine[]): Routine[] {
  return [...list.filter((r) => r.pinned), ...list.filter((r) => !r.pinned)]
}

export function useRoutines(): Routine[] {
  const [list, setList] = useState(loadRoutines)
  useEffect(() => {
    const f = () => setList(loadRoutines())
    routineEvents.addEventListener('change', f)
    window.addEventListener('storage', f)
    return () => {
      routineEvents.removeEventListener('change', f)
      window.removeEventListener('storage', f)
    }
  }, [])
  return list
}

/** The most recent logged sets for an exercise (from the newest workout that has it), for "last time" hints. */
export function previousSets(workouts: WorkoutWithSets[], exercise: string, before?: string): { day: string; sets: { reps: number; weight: number | null }[] } | null {
  const name = exercise.trim().toLowerCase()
  const sorted = [...workouts].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt)
  for (const w of sorted) {
    if (before && w.day >= before) continue
    const sets = w.sets.filter((s) => s.exercise.trim().toLowerCase() === name && !s.isWarmup)
    if (sets.length) return { day: w.day, sets: sets.map((s) => ({ reps: s.reps, weight: s.weight })) }
  }
  return null
}

// ---- Unfinished workout drafts survive refreshes -------------------------------------------------

export interface DraftEntry {
  exerciseId: string
  name: string
  category: MuscleGroup
  reps: string
  weight: string
  done: boolean
}

export interface RunDraft {
  routineId: string
  startedAt: number
  entries: DraftEntry[]
  notes: string
}

const draftKey = (routineId: string) => `bettergarmin:routineDraft:${routineId}`

export function loadDraft(routineId: string): RunDraft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(routineId)) ?? 'null')
  } catch {
    return null
  }
}

export function saveDraft(d: RunDraft) {
  try {
    localStorage.setItem(draftKey(d.routineId), JSON.stringify(d))
  } catch {
    // storage full: the in-memory copy still works for this session
  }
}

export function clearDraft(routineId: string) {
  localStorage.removeItem(draftKey(routineId))
}
