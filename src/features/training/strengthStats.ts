import { MUSCLE_GROUPS, estimateOneRepMax, setVolume, type MuscleGroup } from '../../lib/strength'
import type { WorkoutWithSets, SetRecord } from '../../db/strengthLog'

export interface ExercisePr {
  exercise: string
  category: MuscleGroup
  weight: number
  reps: number
  e1rm: number
  day: string
}

/** Best estimated 1RM per exercise across all logged history. */
export function computePRs(workouts: WorkoutWithSets[]): ExercisePr[] {
  const best = new Map<string, ExercisePr>()
  for (const w of workouts) {
    for (const s of w.sets) {
      if (s.isWarmup || s.weight == null || s.weight <= 0) continue
      const e1rm = estimateOneRepMax(s.weight, s.reps)
      const existing = best.get(s.exercise)
      if (!existing || e1rm > existing.e1rm) {
        best.set(s.exercise, { exercise: s.exercise, category: s.category, weight: s.weight, reps: s.reps, e1rm, day: w.day })
      }
    }
  }
  return Array.from(best.values()).sort((a, b) => b.e1rm - a.e1rm)
}

export interface PrEvent extends ExercisePr {
  /** How much the estimated 1RM improved over the previous best (first-ever set for an exercise is not a PR event). */
  improvementKg: number
}

/** Every time an exercise's estimated 1RM beat its prior best, in chronological order. Powers a "recent PRs" feed. */
export function computePrEvents(workouts: WorkoutWithSets[]): PrEvent[] {
  const sorted = [...workouts].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt - b.createdAt))
  const runningBest = new Map<string, number>()
  const events: PrEvent[] = []
  for (const w of sorted) {
    const setsInOrder = [...w.sets].sort((a, b) => a.order - b.order)
    for (const s of setsInOrder) {
      if (s.isWarmup || s.weight == null || s.weight <= 0) continue
      const e1rm = estimateOneRepMax(s.weight, s.reps)
      const prior = runningBest.get(s.exercise)
      if (prior == null) {
        runningBest.set(s.exercise, e1rm)
        continue
      }
      if (e1rm > prior) {
        events.push({ exercise: s.exercise, category: s.category, weight: s.weight, reps: s.reps, e1rm, day: w.day, improvementKg: e1rm - prior })
        runningBest.set(s.exercise, e1rm)
      }
    }
  }
  return events.reverse()
}

function isoWeekStart(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  const dow = (d.getDay() + 6) % 7 // 0 = Monday
  d.setDate(d.getDate() - dow)
  return d.toISOString().slice(0, 10)
}

export interface WeeklyVolume {
  week: string
  total: number
  byCategory: Record<MuscleGroup, number>
}

/** Total training volume (weight x reps, working sets only) per week, broken down by muscle group. */
export function computeWeeklyVolume(workouts: WorkoutWithSets[]): WeeklyVolume[] {
  const byWeek = new Map<string, WeeklyVolume>()
  for (const w of workouts) {
    const week = isoWeekStart(w.day)
    let entry = byWeek.get(week)
    if (!entry) {
      entry = { week, total: 0, byCategory: Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number> }
      byWeek.set(week, entry)
    }
    for (const s of w.sets) {
      if (s.isWarmup) continue
      const vol = setVolume(s.weight, s.reps)
      entry.total += vol
      entry.byCategory[s.category] += vol
    }
  }
  return Array.from(byWeek.values()).sort((a, b) => (a.week < b.week ? -1 : 1))
}

/** Volume by muscle group across all sets in the given workouts (working sets only), for a balance chart. */
export function computeMuscleBalance(workouts: WorkoutWithSets[]): Record<MuscleGroup, number> {
  const totals = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>
  for (const w of workouts) {
    for (const s of w.sets) {
      if (s.isWarmup) continue
      totals[s.category] += setVolume(s.weight, s.reps)
    }
  }
  return totals
}

/** Same as computeMuscleBalance, but restricted to the last `windowDays` days. */
export function computeRecentMuscleBalance(workouts: WorkoutWithSets[], windowDays: number): Record<MuscleGroup, number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)
  const cutoffDay = cutoff.toISOString().slice(0, 10)
  return computeMuscleBalance(workouts.filter((w) => w.day >= cutoffDay))
}

export interface StreakInfo {
  /** Consecutive weeks (ending this week) with at least one logged workout. */
  currentWeekStreak: number
  sessionsThisWeek: number
}

export function computeStreak(workouts: WorkoutWithSets[]): StreakInfo {
  const weeksWithWorkouts = new Set(workouts.map((w) => isoWeekStart(w.day)))
  const thisWeek = isoWeekStart(new Date().toISOString().slice(0, 10))
  const sessionsThisWeek = workouts.filter((w) => isoWeekStart(w.day) === thisWeek).length

  let streak = 0
  const cursor = new Date(`${thisWeek}T00:00:00`)
  while (weeksWithWorkouts.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setDate(cursor.getDate() - 7)
  }
  return { currentWeekStreak: streak, sessionsThisWeek }
}

/** All sets across every workout for an exercise, chronological, for a 1RM progression chart. */
export function setsForExercise(workouts: WorkoutWithSets[], exercise: string): { day: string; e1rm: number }[] {
  const points: { day: string; e1rm: number }[] = []
  for (const w of workouts) {
    const best = w.sets
      .filter((s): s is SetRecord & { weight: number } => !s.isWarmup && s.weight != null && s.weight > 0 && s.exercise === exercise)
      .reduce<number | null>((max, s) => {
        const e1rm = estimateOneRepMax(s.weight, s.reps)
        return max == null || e1rm > max ? e1rm : max
      }, null)
    if (best != null) points.push({ day: w.day, e1rm: Math.round(best * 10) / 10 })
  }
  return points.sort((a, b) => (a.day < b.day ? -1 : 1))
}
