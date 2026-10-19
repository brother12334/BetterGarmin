import { estimateOneRepMax } from '../../lib/strength'
import type { WorkoutWithSets } from '../../db/strengthLog'

/** Progress figures computed only from what was actually logged or recorded. */

export interface SessionLike {
  /** Epoch ms of the start (or the day at noon when only the day is known). */
  at: number
  /** Seconds, or null when the duration wasn't recorded. */
  duration: number | null
}

export interface WeekStat {
  /** Monday of the week, YYYY-MM-DD. */
  week: string
  workouts: number
  /** Seconds across workouts with a known duration. */
  seconds: number
  /** Workouts without a recorded duration (left out of the time total). */
  unknownDuration: number
}

function mondayOf(t: number): string {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function weeklyStats(sessions: SessionLike[], weeks = 8, now = Date.now()): WeekStat[] {
  const out: WeekStat[] = []
  for (let i = weeks - 1; i >= 0; i--) out.push({ week: mondayOf(now - i * 7 * 86_400_000), workouts: 0, seconds: 0, unknownDuration: 0 })
  const byWeek = new Map(out.map((w) => [w.week, w]))
  for (const s of sessions) {
    const w = byWeek.get(mondayOf(s.at))
    if (!w) continue
    w.workouts++
    if (s.duration != null) w.seconds += s.duration
    else w.unknownDuration++
  }
  return out
}

export interface ExerciseProgress {
  exercise: string
  /** Best estimated 1RM ever and when. */
  best: { e1rm: number; weight: number; reps: number; day: string }
  /** Latest session's best set and the session before it, for comparison. */
  latest: { day: string; e1rm: number; weight: number; reps: number }
  previous: { day: string; e1rm: number; weight: number; reps: number } | null
  /** The latest session set the all-time best. */
  isRecord: boolean
}

/** Per exercise: all-time best, latest session vs the one before. Only sets with a weight and reps count. */
export function exerciseProgress(workouts: WorkoutWithSets[]): ExerciseProgress[] {
  const sessions = new Map<string, { day: string; e1rm: number; weight: number; reps: number }[]>()
  for (const w of workouts) {
    const bestByExercise = new Map<string, { day: string; e1rm: number; weight: number; reps: number }>()
    for (const s of w.sets) {
      if (s.isWarmup || !s.weight || !s.reps) continue
      const e1rm = estimateOneRepMax(s.weight, s.reps)
      const cur = bestByExercise.get(s.exercise)
      if (!cur || e1rm > cur.e1rm) bestByExercise.set(s.exercise, { day: w.day, e1rm, weight: s.weight, reps: s.reps })
    }
    for (const [ex, b] of bestByExercise) sessions.set(ex, [...(sessions.get(ex) ?? []), b])
  }
  const out: ExerciseProgress[] = []
  for (const [exercise, list] of sessions) {
    list.sort((a, b) => a.day.localeCompare(b.day))
    const latest = list[list.length - 1]
    const previous = list.length > 1 ? list[list.length - 2] : null
    const best = list.reduce((m, x) => (x.e1rm > m.e1rm ? x : m))
    const priorBest = list.slice(0, -1).reduce((m, x) => Math.max(m, x.e1rm), 0)
    out.push({ exercise, best, latest, previous, isRecord: list.length > 1 && latest.e1rm > priorBest })
  }
  return out.sort((a, b) => b.latest.day.localeCompare(a.latest.day))
}
