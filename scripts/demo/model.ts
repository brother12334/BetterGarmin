import { addDays, dayOfWeek, toDay } from './format'
import type { Rng } from './rng'
import { pickSplit, type StrengthSplit } from '../../src/lib/strengthPlans'

export type Sport = 'running' | 'walking' | 'hiking' | 'cycling' | 'paddling' | 'climbing' | 'strength_training'

export interface ActivityPlan {
  sport: Sport
  startMinuteOfDay: number
  durationMin: number
  /** 0 = easy, 1 = max effort. Drives HR, pace, training load. */
  intensity: number
  distanceKm: number | null
  /** Only set for strength_training plans. */
  split?: StrengthSplit
}

export interface DayModel {
  day: string
  dow: number
  isRestDay: boolean
  fitness: number // 0..1, slowly improving — drives pace/VO2max trends
  fatigue: number // 0..1, from recent training load — drives HRV/RHR/readiness
  weight: number | null
  rhr: number
  hrvLastNight: number
  hrvWeeklyAvg: number
  hrvBaselineLow: number
  hrvBaselineHigh: number
  sleepStartMinuteOfDay: number // minutes after previous midnight, can exceed 1440
  sleepDurationMin: number
  deepMin: number
  lightMin: number
  remMin: number
  awakeMin: number
  sleepAvgSpo2: number
  sleepAvgRr: number
  sleepAvgStress: number
  sleepScore: number
  sleepQualifier: string
  steps: number
  floorsUp: number
  distanceKm: number
  caloriesBmr: number
  caloriesActive: number
  caloriesConsumed: number
  stressAvg: number
  bbCharged: number
  bbMax: number
  bbMin: number
  spo2Avg: number
  spo2Min: number
  rrWakingAvg: number
  rrMax: number
  rrMin: number
  moderateMin: number
  vigorousMin: number
  activities: ActivityPlan[]
}

const SLEEP_QUALIFIERS = ['poor', 'fair', 'good', 'excellent'] as const

function qualifierFor(score: number): string {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}

export function generateDayModels(rng: Rng, startDate: Date, numDays: number): DayModel[] {
  const days: DayModel[] = []

  let fitness = 0.35 // improves over the dataset as training accumulates
  let atl = 20 // acute training load (7-day exp. avg)
  let ctl = 18 // chronic training load (28-day exp. avg)
  let weight = rng.range(74, 82)
  const weightTarget = weight - rng.range(2, 5) // slow fat-loss arc over the dataset
  let lastSplit: StrengthSplit | null = null

  for (let i = 0; i < numDays; i++) {
    const date = addDays(startDate, i)
    const day = toDay(date)
    const dow = dayOfWeek(day)
    const isWeekend = dow === 0 || dow === 6

    // Fitness improves slowly with accumulated training, plateauing.
    fitness = Math.min(0.95, fitness + (ctl / 100) * 0.0025 + rng.range(-0.001, 0.0015))
    const fatigue = Math.max(0, Math.min(1, (atl - ctl) / 25 + 0.25))

    const restProbability = 0.3 - fitness * 0.08 + (isWeekend ? -0.1 : 0.05)
    const isRestDay = rng.chance(Math.max(0.12, restProbability))

    // --- plan today's activity (if any) ---
    const activities: ActivityPlan[] = []
    let todaysLoad = 0
    if (!isRestDay) {
      const sport = rng.weightedChoice<Sport>([
        { value: 'strength_training', weight: 46 },
        { value: 'running', weight: 20 },
        { value: 'cycling', weight: 14 },
        { value: 'walking', weight: 10 },
        { value: 'hiking', weight: isWeekend ? 8 : 2 },
        { value: 'paddling', weight: 3 },
        { value: 'climbing', weight: 2 },
      ])
      const longWorkout = isWeekend && rng.chance(0.45)
      const intensity = sport === 'walking' ? rng.range(0.1, 0.35) : sport === 'strength_training' ? rng.range(0.45, 0.85) : rng.range(0.35, 0.95)
      const baseDuration =
        sport === 'walking'
          ? rng.range(20, 45)
          : sport === 'hiking'
            ? rng.range(70, 180)
            : sport === 'climbing'
              ? rng.range(45, 100)
              : sport === 'strength_training'
                ? rng.range(40, 75)
                : rng.range(28, 55)
      const durationMin = longWorkout && sport !== 'strength_training' ? baseDuration * rng.range(1.4, 2.1) : baseDuration
      const startMinuteOfDay =
        sport === 'strength_training'
          ? isWeekend
            ? rng.int(10 * 60, 13 * 60)
            : rng.int(17 * 60 + 30, 20 * 60)
          : isWeekend
            ? rng.int(8 * 60, 10 * 60)
            : rng.int(6 * 60, 7 * 60 + 30)

      const paceFactor = sport === 'running' || sport === 'walking' || sport === 'hiking' ? 0.6 + fitness * 0.6 : 1
      const speedKmh =
        sport === 'running'
          ? 8 + fitness * 4.5
          : sport === 'walking'
            ? 5
            : sport === 'hiking'
              ? 3.8
              : sport === 'cycling'
                ? 22 + fitness * 10
                : sport === 'paddling'
                  ? 6
                  : 0
      const distanceKm =
        sport === 'climbing' || sport === 'strength_training' ? null : (speedKmh * durationMin) / 60 * (0.85 + paceFactor * 0.15)

      let split: StrengthSplit | undefined
      if (sport === 'strength_training') {
        split = pickSplit(rng, lastSplit)
        lastSplit = split
      }

      activities.push({ sport, startMinuteOfDay, durationMin, intensity, distanceKm, split })
      // simplified TRIMP-like load: duration * intensity^1.5 * 10
      todaysLoad = durationMin * Math.pow(intensity, 1.5) * (sport === 'cycling' ? 0.8 : 1)

      // occasional double-activity day (e.g. short walk + evening ride)
      if (rng.chance(0.08) && sport !== 'climbing') {
        const secondDurationMin = rng.range(15, 30)
        activities.push({
          sport: 'walking',
          startMinuteOfDay: rng.int(17 * 60, 19 * 60),
          durationMin: secondDurationMin,
          intensity: rng.range(0.1, 0.25),
          distanceKm: (5 * secondDurationMin) / 60,
        })
      }
    }

    atl = atl * (6 / 7) + todaysLoad * (1 / 7)
    ctl = ctl * (27 / 28) + todaysLoad * (1 / 28)

    // --- recovery metrics ---
    const rhr = Math.round(62 - fitness * 10 - rng.range(-1.5, 1.5) + fatigue * 3)
    const hrvBaseline = 32 + fitness * 28
    const hrvLastNight = Math.round(hrvBaseline - fatigue * 12 + rng.gaussian(0, 4))
    const hrvWeeklyAvg = Math.round(hrvBaseline - fatigue * 6)

    // --- sleep ---
    const sleepDurationMin = Math.round(rng.gaussian(isWeekend ? 465 : 435, 35) - fatigue * 20)
    const sleepStartMinuteOfDay = Math.round(rng.gaussian(isWeekend ? 23 * 60 + 30 : 22 * 60 + 45, 25))
    const awakeMin = Math.max(3, Math.round(rng.gaussian(10 + fatigue * 8, 5)))
    const remFrac = 0.21 + rng.range(-0.03, 0.03)
    const deepFrac = 0.17 + rng.range(-0.03, 0.03) - fatigue * 0.03
    const remMin = Math.round(sleepDurationMin * remFrac)
    const deepMin = Math.round(sleepDurationMin * Math.max(0.08, deepFrac))
    const lightMin = Math.max(30, sleepDurationMin - remMin - deepMin - awakeMin)
    const consistencyPenalty = Math.abs(sleepStartMinuteOfDay - (22 * 60 + 45)) / 60
    const durationPenalty = Math.abs(sleepDurationMin - 460) / 18
    const stageBonus = (deepFrac - 0.15) * 70 + (remFrac - 0.2) * 45
    const sleepScore = Math.round(
      Math.max(
        30,
        Math.min(
          98,
          80 + stageBonus - durationPenalty - consistencyPenalty * 2.5 - fatigue * 14 + rng.gaussian(0, 5),
        ),
      ),
    )

    // --- daily activity / energy ---
    const activityMinutes = activities.reduce((s, a) => s + a.durationMin, 0)
    const cardioMinutes = activities.filter((a) => a.sport !== 'strength_training').reduce((s, a) => s + a.durationMin, 0)
    const steps = Math.round(
      (isRestDay ? rng.range(3500, 7000) : rng.range(6500, 10500)) + cardioMinutes * rng.range(90, 130),
    )
    const floorsUp = Math.round(Math.max(0, rng.gaussian(isRestDay ? 4 : 9, 4)))
    const distanceKm = Math.round(((steps * 0.00075) + activities.reduce((s, a) => s + (a.distanceKm ?? 0), 0)) * 100) / 100
    const caloriesBmr = Math.round(1550 + weight * 5)
    const caloriesActive = Math.round(steps * 0.04 + activityMinutes * rng.range(7, 11))
    const caloriesConsumed = Math.round(caloriesBmr + caloriesActive + rng.gaussian(0, 150))

    const moderateMin = Math.round(activities.filter((a) => a.intensity >= 0.3 && a.intensity < 0.65).reduce((s, a) => s + a.durationMin, 0))
    const vigorousMin = Math.round(activities.filter((a) => a.intensity >= 0.65).reduce((s, a) => s + a.durationMin, 0))

    const stressAvg = Math.round(Math.max(8, Math.min(70, 28 + fatigue * 25 - (sleepScore - 60) * 0.15 + rng.gaussian(0, 6))))
    const bbMin = Math.round(Math.max(5, 35 - fatigue * 20 + rng.gaussian(0, 6)))
    const bbMax = Math.round(Math.min(100, 88 - fatigue * 5 + rng.gaussian(0, 5)))
    const bbCharged = Math.round(Math.max(20, Math.min(100, bbMax - (100 - sleepScore) * 0.3)))

    // weight measured roughly every other day, trending toward target
    weight += (weightTarget - weight) * 0.01 + rng.gaussian(0, 0.25)
    const weightMeasuredToday = rng.chance(0.4)

    days.push({
      day,
      dow,
      isRestDay,
      fitness,
      fatigue,
      weight: weightMeasuredToday ? Math.round(weight * 10) / 10 : null,
      rhr,
      hrvLastNight,
      hrvWeeklyAvg,
      hrvBaselineLow: Math.round(hrvBaseline - 10),
      hrvBaselineHigh: Math.round(hrvBaseline + 10),
      sleepStartMinuteOfDay,
      sleepDurationMin: Math.max(180, sleepDurationMin),
      deepMin,
      lightMin,
      remMin,
      awakeMin,
      sleepAvgSpo2: Math.round(rng.gaussian(96.5, 1) * 10) / 10,
      sleepAvgRr: Math.round(rng.gaussian(13.5, 1.2) * 10) / 10,
      sleepAvgStress: Math.round(Math.max(5, stressAvg * 0.5 + rng.gaussian(0, 3))),
      sleepScore,
      sleepQualifier: qualifierFor(sleepScore),
      steps,
      floorsUp,
      distanceKm,
      caloriesBmr,
      caloriesActive,
      caloriesConsumed,
      stressAvg,
      bbCharged,
      bbMax,
      bbMin,
      spo2Avg: Math.round(rng.gaussian(97, 0.8) * 10) / 10,
      spo2Min: Math.round(rng.gaussian(93, 1.5) * 10) / 10,
      rrWakingAvg: Math.round(rng.gaussian(15, 1.2) * 10) / 10,
      rrMax: Math.round(rng.gaussian(19, 1.5) * 10) / 10,
      rrMin: Math.round(rng.gaussian(11, 1) * 10) / 10,
      moderateMin,
      vigorousMin,
      activities,
    })
  }

  return days
}

export { SLEEP_QUALIFIERS }
