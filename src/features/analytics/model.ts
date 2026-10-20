import type { SetRecord, WorkoutWithSets } from '../../db/strengthLog'
import type { ActivityRow } from '../../db/types'
import { estimateOneRepMax } from '../../lib/strength'
import { parseGarminTimestamp } from '../training/matchGarminActivity'
import type { WorkoutAnalysis } from '../training/loadWorkoutAnalysis'

/** Pure data model shared by every analysis — no database access, so it is unit-testable. */

export interface DayRecord {
  day: string
  restingHr: number | null
  hrv: number | null
  sleepMinutes: number | null
  sleepScore: number | null
  /** Bedtime as hours after noon of the previous day (e.g. 23:30 → 11.5), so midnight doesn't wrap. */
  bedtime: number | null
  steps: number | null
  stressAvg: number | null
  /** Sleep window (epoch ms), awake minutes in bed, blood oxygen and waking respiration, when recorded. */
  sleepStartMs?: number | null
  sleepEndMs?: number | null
  awakeMinutes?: number | null
  spo2Avg?: number | null
  respirationAvg?: number | null
}

export interface ExerciseSession {
  exercise: string
  workoutId: string
  day: string
  workingSets: SetRecord[]
  /** Best Epley e1RM among working sets with a load. */
  topE1rm: number | null
  topSet: { weight: number; reps: number } | null
  volumeKg: number
}

export interface SessionRecord {
  workoutId: string
  day: string
  title: string
  startMs: number | null
  hourOfDay: number | null
  timed: boolean
  feel: number | null
  volumeKg: number
  workingSetCount: number
  exercises: ExerciseSession[]
}

export interface AnalyticsDataset {
  firstDay: string
  lastDay: string
  days: DayRecord[]
  dayIndex: Map<string, DayRecord>
  sessions: SessionRecord[]
  exerciseHistory: Map<string, ExerciseSession[]>
  aligned: Map<string, WorkoutAnalysis>
  workouts: WorkoutWithSets[]
}



export function exerciseSessionsOf(workout: WorkoutWithSets): ExerciseSession[] {
  const byExercise = new Map<string, SetRecord[]>()
  for (const s of workout.sets) {
    if (s.isWarmup) continue
    const list = byExercise.get(s.exercise) ?? []
    list.push(s)
    byExercise.set(s.exercise, list)
  }
  return Array.from(byExercise.entries()).map(([exercise, workingSets]) => {
    let top: { weight: number; reps: number; e1rm: number } | null = null
    for (const s of workingSets) {
      if (s.weight == null || s.weight <= 0) continue
      const e1rm = estimateOneRepMax(s.weight, s.reps)
      if (!top || e1rm > top.e1rm) top = { weight: s.weight, reps: s.reps, e1rm }
    }
    return {
      exercise,
      workoutId: workout.id,
      day: workout.day,
      workingSets,
      topE1rm: top?.e1rm ?? null,
      topSet: top ? { weight: top.weight, reps: top.reps } : null,
      volumeKg: workingSets.reduce((sum, s) => sum + (s.weight ?? 0) * s.reps, 0),
    }
  })
}

export function buildSessions(workouts: WorkoutWithSets[], activitiesById: Map<string, ActivityRow>): SessionRecord[] {
  return [...workouts]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt - b.createdAt))
    .map((w) => {
      const activity = w.linkedActivityId ? activitiesById.get(w.linkedActivityId) : undefined
      const startMs = w.startedAtEpochMs ?? parseGarminTimestamp(activity?.start_time) ?? null
      const exercises = exerciseSessionsOf(w)
      return {
        workoutId: w.id,
        day: w.day,
        title: w.title ?? (w.split === 'custom' ? 'Workout' : w.split.replace('_', ' ')),
        startMs,
        hourOfDay: startMs != null ? new Date(startMs).getHours() + new Date(startMs).getMinutes() / 60 : null,
        timed: w.startedAtEpochMs != null,
        feel: w.feelRating ?? activity?.self_eval_feel ?? null,
        volumeKg: exercises.reduce((s, e) => s + e.volumeKg, 0),
        workingSetCount: exercises.reduce((s, e) => s + e.workingSets.length, 0),
        exercises,
      }
    })
}

export function indexExercises(sessions: SessionRecord[]): Map<string, ExerciseSession[]> {
  const out = new Map<string, ExerciseSession[]>()
  for (const s of sessions) {
    for (const e of s.exercises) {
      const list = out.get(e.exercise) ?? []
      list.push(e)
      out.set(e.exercise, list)
    }
  }
  return out
}

