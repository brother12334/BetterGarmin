import type { ActivityRow } from '../../db/types'
import type { SetRecord, WorkoutWithSets } from '../../db/strengthLog'
import type { WorkoutTimeline } from './workoutTimeline'

/**
 * The post-workout summary: headline numbers, a grade per area and a short plan. Grades are BetterGarmin's own
 * heuristics from the data available; every grade says what it was based on, and areas without data aren't graded.
 */

export type Letter = 'A' | 'A−' | 'B+' | 'B' | 'B−' | 'C+' | 'C' | 'D'

export interface Grade {
  area: 'strength' | 'effort' | 'heart' | 'rest' | 'recovery'
  title: string
  letter: Letter
  /** 0–100, drives the meter. */
  score: number
  /** What the grade was based on, in plain words. */
  basis: string
}

export interface Comparison {
  label: string
  /** Percentage change vs last time; positive = more. */
  change: number
  /** Whether more is better for this metric. */
  higherIsBetter: boolean
}

export interface TopSet {
  exercise: string
  weight: number | null
  reps: number
  pr: boolean
}

export interface WorkoutSummary {
  durationMin: number | null
  liftingMin: number | null
  calories: number | null
  caloriesPerMin: number | null
  hrAvg: number | null
  hrMax: number | null
  hrMin: number | null
  /** Minutes in five bands of the session's own peak heart rate (lowest first). */
  effortBandsMin: number[] | null
  trainingLoad: number | null
  aerobicTE: number | null
  anaerobicTE: number | null
  volumeKg: number
  workingSets: number
  reps: number
  prs: number
  topSets: TopSet[]
  restAvgSec: number | null
  shortRests: number
  hrDrop60Avg: number | null
  /** Peak set: exercise and set number where heart rate was highest. */
  peakSet: { exercise: string; setNumber: number; hr: number } | null
  vsLast: Comparison[]
  grades: Grade[]
  overall: { letter: Letter; score: number } | null
  recoveryHours: number | null
  nextUp: string[]
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function letterFor(score: number): Letter {
  if (score >= 90) return 'A'
  if (score >= 85) return 'A−'
  if (score >= 80) return 'B+'
  if (score >= 74) return 'B'
  if (score >= 68) return 'B−'
  if (score >= 62) return 'C+'
  if (score >= 55) return 'C'
  return 'D'
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const volumeOf = (sets: { weight: number | null; reps: number; isWarmup: boolean }[]) =>
  sets.filter((s) => !s.isWarmup).reduce((n, s) => n + (s.weight ?? 0) * s.reps, 0)
const e1rm = (w: number, r: number) => w * (1 + r / 30)

export interface SummaryInput {
  workout: WorkoutWithSets
  activity: ActivityRow | null
  timeline: WorkoutTimeline | null
  /** Most recent earlier session of each exercise in this workout. */
  previousByExercise: Map<string, { sets: SetRecord[] }>
  sleepScore?: number | null
}

export function buildWorkoutSummary({ workout, activity, timeline, previousByExercise, sleepScore }: SummaryInput): WorkoutSummary {
  const working = workout.sets.filter((s) => !s.isWarmup)
  const volumeKg = volumeOf(workout.sets)
  const reps = working.reduce((n, s) => n + s.reps, 0)
  const prs = workout.sets.filter((s) => s.personalRecord).length

  const durationMs =
    timeline?.totalMs ??
    (workout.startedAtEpochMs != null && workout.finishedAtEpochMs != null ? workout.finishedAtEpochMs - workout.startedAtEpochMs : null)
  const durationMin = durationMs != null ? Math.round(durationMs / 60000) : null
  const liftingMin = timeline ? Math.round(timeline.setMs / 60000) : null
  const calories = activity?.calories ?? null
  const caloriesPerMin = calories != null && durationMin ? +(calories / durationMin).toFixed(1) : null

  const hrAvg = timeline?.hrAvg ?? activity?.avg_hr ?? null
  const hrMax = timeline?.hrPeak ?? activity?.max_hr ?? null
  const hrMin = timeline?.hrMin ?? null
  const effortBandsMin = timeline && timeline.hrSeries.length > 0 ? timeline.effortBandsMs.map((ms) => Math.round(ms / 60000)) : null

  // Top set per exercise (best estimated 1RM), in workout order.
  const byExercise = new Map<string, TopSet & { score: number }>()
  for (const s of working) {
    const score = e1rm(s.weight ?? 0, s.reps)
    const cur = byExercise.get(s.exercise)
    if (!cur || score > cur.score) byExercise.set(s.exercise, { exercise: s.exercise, weight: s.weight, reps: s.reps, pr: !!s.personalRecord || !!cur?.pr, score })
    else if (s.personalRecord) cur.pr = true
  }
  const topSets = [...byExercise.values()].map(({ score: _s, ...t }) => {
    void _s
    return t
  })

  // Rests: from the timeline when available, else the rest the source app reported.
  const rests = timeline
    ? timeline.sets.flatMap((s) => (s.restAfter && !s.set.isWarmup ? [s.restAfter.durationMs / 1000] : []))
    : working.flatMap((s) => (s.restSecondsBefore != null ? [s.restSecondsBefore] : []))
  const restAvgSec = avg(rests)
  const shortRests = rests.filter((r) => r < 90).length
  const drops = timeline?.sets.flatMap((s) => (s.restAfter?.drop60 != null ? [s.restAfter.drop60] : [])) ?? []
  const hrDrop60Avg = drops.length ? Math.round(avg(drops)!) : null

  let peakSet: WorkoutSummary['peakSet'] = null
  for (const s of timeline?.sets ?? []) {
    if (s.stats.peak != null && (!peakSet || s.stats.peak > peakSet.hr)) peakSet = { exercise: s.set.exercise, setNumber: s.setNumberInExercise, hr: s.stats.peak }
  }

  // Versus last time: same exercises only, so a shorter workout isn't compared with a longer one.
  let thisVol = 0
  let lastVol = 0
  let thisReps = 0
  let lastReps = 0
  for (const [exercise, prev] of previousByExercise) {
    const now = working.filter((s) => s.exercise === exercise)
    if (now.length === 0) continue
    thisVol += volumeOf(now)
    lastVol += volumeOf(prev.sets)
    thisReps += now.reduce((n, s) => n + s.reps, 0)
    lastReps += prev.sets.filter((s) => !s.isWarmup).reduce((n, s) => n + s.reps, 0)
  }
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)
  const vsLast: Comparison[] = []
  const volChange = pct(thisVol, lastVol)
  if (volChange != null) vsLast.push({ label: 'Volume', change: volChange, higherIsBetter: true })
  const repChange = pct(thisReps, lastReps)
  if (repChange != null) vsLast.push({ label: 'Reps', change: repChange, higherIsBetter: true })

  // Grades. Each needs its own data; missing data means no grade, never a guess.
  const grades: Grade[] = []
  if (working.length > 0) {
    const s = clamp(72 + (volChange != null ? clamp(volChange, -20, 20) : 0) + Math.min(prs, 3) * 6)
    grades.push({
      area: 'strength',
      title: 'Strength',
      letter: letterFor(s),
      score: s,
      basis: `${Math.round(volumeKg).toLocaleString()} kg${volChange != null ? ` · ${volChange >= 0 ? '+' : ''}${volChange}% vs last time` : ''}${prs ? ` · ${prs} PR${prs > 1 ? 's' : ''}` : ''}`,
    })
  }
  if (activity?.training_effect != null || calories != null) {
    const te = activity?.training_effect ?? null
    // Training effect 2–3.9 is the productive range for a strength day; above 4 is very hard, below 1.5 light.
    const s = te != null ? clamp(te >= 4 ? 82 : te >= 2 ? 78 + (te - 2) * 8 : 50 + te * 14) : clamp(55 + (caloriesPerMin ?? 0) * 4)
    grades.push({
      area: 'effort',
      title: 'Effort',
      letter: letterFor(s),
      score: Math.round(s),
      basis: [calories != null ? `${calories} kcal` : null, activity?.training_load != null ? `load ${Math.round(activity.training_load)}` : null, te != null ? `training effect ${te.toFixed(1)}` : null].filter(Boolean).join(' · '),
    })
  }
  if (effortBandsMin && hrAvg != null && hrMax != null) {
    const top = effortBandsMin[3] + effortBandsMin[4]
    const total = effortBandsMin.reduce((a, b) => a + b, 0) || 1
    const s = clamp(60 + (top / total) * 120)
    grades.push({ area: 'heart', title: 'Heart', letter: letterFor(s), score: Math.round(s), basis: `avg ${hrAvg} · peak ${hrMax} · ${top} min in your top two bands` })
  }
  if (rests.length >= 3) {
    // 90 s–4 min is a sensible range for working sets; each very short rest costs points.
    const inRange = rests.filter((r) => r >= 90 && r <= 240).length / rests.length
    const s = clamp(45 + inRange * 55)
    grades.push({ area: 'rest', title: 'Rest discipline', letter: letterFor(s), score: Math.round(s), basis: `avg ${fmtRest(restAvgSec!)} · ${shortRests} rest${shortRests === 1 ? '' : 's'} under 90 s` })
  }
  if (hrDrop60Avg != null) {
    const s = clamp(50 + hrDrop60Avg * 1.6)
    grades.push({ area: 'recovery', title: 'Recovery between sets', letter: letterFor(s), score: Math.round(s), basis: `heart rate fell ${hrDrop60Avg} bpm in the first minute of rest, on average` })
  }
  const overallScore = grades.length ? Math.round(avg(grades.map((g) => g.score))!) : null
  const overall = overallScore != null ? { letter: letterFor(overallScore), score: overallScore } : null

  // Rough recovery estimate: harder sessions need longer. Clearly labelled as an estimate in the UI.
  const te = activity?.training_effect
  const recoveryHours = te != null ? Math.round(12 + te * 9) : working.length > 0 ? Math.round(clamp(18 + working.length, 18, 48)) : null

  const nextUp: string[] = []
  if (recoveryHours != null) nextUp.push(`Give these muscles about ${recoveryHours} hours before training them hard again.`)
  const progress = topSets.find((t) => t.weight != null && t.weight > 0)
  if (progress && progress.weight != null) {
    nextUp.push(
      progress.reps >= 12
        ? `${progress.exercise}: try ${round(progress.weight * 1.025)} kg next time, aiming for 8–10 reps.`
        : `${progress.exercise}: stay at ${round(progress.weight)} kg and aim for ${progress.reps + 1} reps.`,
    )
  }
  if (shortRests >= 3) nextUp.push(`${shortRests} rests were under 90 seconds. Resting 2–3 minutes on the big lifts usually lets you lift more.`)
  if (sleepScore != null && sleepScore < 60) nextUp.push('Your sleep score was low before this session; an early night will help you recover.')
  else nextUp.push('Sleep well tonight: most strength recovery happens during sleep.')

  return {
    durationMin,
    liftingMin,
    calories,
    caloriesPerMin,
    hrAvg,
    hrMax,
    hrMin,
    effortBandsMin,
    trainingLoad: activity?.training_load != null ? Math.round(activity.training_load) : null,
    aerobicTE: activity?.training_effect ?? null,
    anaerobicTE: activity?.anaerobic_training_effect ?? null,
    volumeKg: Math.round(volumeKg),
    workingSets: working.length,
    reps,
    prs,
    topSets,
    restAvgSec: restAvgSec != null ? Math.round(restAvgSec) : null,
    shortRests,
    hrDrop60Avg,
    peakSet,
    vsLast,
    grades,
    overall,
    recoveryHours,
    nextUp,
  }
}

const round = (kg: number) => Math.round(kg * 2) / 2

export function fmtRest(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
