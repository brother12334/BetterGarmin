import { getAllWorkoutsWithSets } from '../../db/strengthLog'
import {
  getActivitiesRange,
  getDailySummaryRange,
  getHrvRange,
  getLatestDay,
  getRestingHrRange,
  getSleepRange,
} from '../../db/queries'
import type { DbKind } from '../../db/types'
import { addDays, enumerateDays, normalizeDay } from '../../lib/dateRange'
import { hmsToMinutes } from '../../lib/duration'
import { parseGarminTimestamp } from '../training/matchGarminActivity'
import { loadWorkoutAnalysis, type WorkoutAnalysis } from '../training/loadWorkoutAnalysis'
import { buildSessions, indexExercises, type AnalyticsDataset, type DayRecord } from './model'

export type { AnalyticsDataset } from './model'

export const ANALYSIS_WINDOW_DAYS = 365
/** Per-workout HR alignment is the expensive part; only the most recent timed workouts are aligned. */
const MAX_ALIGNED_WORKOUTS = 40

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function bedtimeHours(start: string | null): number | null {
  const t = parseGarminTimestamp(start)
  if (t == null) return null
  const d = new Date(t)
  const h = d.getHours() + d.getMinutes() / 60
  return h >= 12 ? h - 12 : h + 12
}

export async function loadAnalyticsDataset(loadedKinds: DbKind[]): Promise<AnalyticsDataset> {
  const hasGarmin = loadedKinds.includes('garmin')
  const workouts = await getAllWorkoutsWithSets()
  const latestGarmin = hasGarmin ? normalizeDay(await getLatestDay()) : null
  const latestWorkout = workouts.reduce<string | null>((m, w) => {
    const d = normalizeDay(w.day)
    return d != null && (m == null || d > m) ? d : m
  }, null)
  const lastDay = [latestGarmin, latestWorkout].filter((d): d is string => d != null).sort().pop() ?? today()
  const firstDay = addDays(lastDay, -ANALYSIS_WINDOW_DAYS)

  const [summary, resting, sleep, hrv, activities] = await Promise.all([
    hasGarmin ? getDailySummaryRange(firstDay, lastDay) : Promise.resolve([]),
    hasGarmin ? getRestingHrRange(firstDay, lastDay) : Promise.resolve([]),
    hasGarmin ? getSleepRange(firstDay, lastDay) : Promise.resolve([]),
    hasGarmin ? getHrvRange(firstDay, lastDay) : Promise.resolve([]),
    loadedKinds.includes('activities') ? getActivitiesRange(firstDay, lastDay) : Promise.resolve([]),
  ])

  const summaryByDay = new Map(summary.map((s) => [normalizeDay(s.day), s]))
  const restingByDay = new Map(resting.map((r) => [normalizeDay(r.day), r.resting_heart_rate]))
  const sleepByDay = new Map(sleep.map((s) => [normalizeDay(s.day), s]))
  const hrvByDay = new Map(hrv.map((h) => [normalizeDay(h.day), h.last_night_avg]))

  const days: DayRecord[] = enumerateDays(firstDay, lastDay).map((day) => {
    const s = summaryByDay.get(day)
    const sl = sleepByDay.get(day)
    return {
      day,
      restingHr: restingByDay.get(day) ?? s?.rhr ?? null,
      hrv: hrvByDay.get(day) ?? null,
      sleepMinutes: sl ? hmsToMinutes(sl.total_sleep) : null,
      sleepScore: sl?.score ?? null,
      bedtime: sl ? bedtimeHours(sl.start) : null,
      steps: s?.steps ?? null,
      stressAvg: s?.stress_avg ?? null,
    }
  })

  const activitiesById = new Map(activities.map((a) => [a.activity_id, a]))
  const inWindow = workouts.filter((w) => w.day >= firstDay)
  const sessions = buildSessions(inWindow, activitiesById)

  const aligned = new Map<string, WorkoutAnalysis>()
  const timed = inWindow.filter((w) => w.startedAtEpochMs != null).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, MAX_ALIGNED_WORKOUTS)
  for (const w of timed) aligned.set(w.id, await loadWorkoutAnalysis(w, loadedKinds))

  return { firstDay, lastDay, days, dayIndex: new Map(days.map((d) => [d.day, d])), sessions, exerciseHistory: indexExercises(sessions), aligned, workouts: inWindow }
}
