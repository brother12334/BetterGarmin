import { atMinute, minutesToHms, toDateTime } from './format'
import type { Rng } from './rng'
import type { ActivityPlan, DayModel } from './model'

const HR_STEP_MIN = 10
const PULSE_OX_STEP_MIN = 60
const BUCKET_STEP_MIN = 15

function activityAt(day: DayModel, minuteOfDay: number): { intensity: number } | null {
  for (const a of day.activities) {
    if (minuteOfDay >= a.startMinuteOfDay && minuteOfDay < a.startMinuteOfDay + a.durationMin) {
      return { intensity: a.intensity }
    }
  }
  return null
}

function isAsleep(day: DayModel, minuteOfDay: number): boolean {
  // sleepStartMinuteOfDay is relative to the previous evening; treat <360 (6am) as "still asleep from last night".
  const wakeMinute = (day.sleepStartMinuteOfDay + day.sleepDurationMin) % 1440
  if (day.sleepStartMinuteOfDay >= 1440) {
    // started after midnight (rare) — asleep from 0 until wake
    return minuteOfDay < wakeMinute
  }
  return minuteOfDay < wakeMinute
}

export function generateHrSamples(rng: Rng, day: string, model: DayModel): { timestamp: string; heart_rate: number }[] {
  const rows: { timestamp: string; heart_rate: number }[] = []
  for (let m = 0; m < 1440; m += HR_STEP_MIN) {
    const asleep = isAsleep(model, m)
    const activity = activityAt(model, m)
    let hr = asleep ? model.rhr - rng.range(0, 4) : model.rhr + rng.range(8, 20)
    if (activity) {
      const maxHr = 188 - model.fitness * 8
      hr = model.rhr + (maxHr - model.rhr) * (0.4 + activity.intensity * 0.5) + rng.gaussian(0, 4)
    }
    rows.push({ timestamp: toDateTime(atMinute(day, m)), heart_rate: Math.round(Math.max(38, hr)) })
  }
  return rows
}

export function generateStressSamples(rng: Rng, day: string, model: DayModel): { timestamp: string; stress: number }[] {
  const rows: { timestamp: string; stress: number }[] = []
  for (let m = 0; m < 1440; m += HR_STEP_MIN) {
    const asleep = isAsleep(model, m)
    const activity = activityAt(model, m)
    let stress = asleep ? model.sleepAvgStress + rng.gaussian(0, 4) : model.stressAvg + rng.gaussian(0, 10)
    if (activity) stress = Math.min(95, stress + activity.intensity * 45)
    rows.push({ timestamp: toDateTime(atMinute(day, m)), stress: Math.round(Math.max(-2, stress)) })
  }
  return rows
}

export function generateRrSamples(rng: Rng, day: string, model: DayModel): { timestamp: string; rr: number }[] {
  const rows: { timestamp: string; rr: number }[] = []
  for (let m = 0; m < 1440; m += HR_STEP_MIN) {
    const asleep = isAsleep(model, m)
    const activity = activityAt(model, m)
    let rr = asleep ? model.sleepAvgRr + rng.gaussian(0, 0.8) : model.rrWakingAvg + rng.gaussian(0, 1)
    if (activity) rr = Math.min(32, rr + activity.intensity * 10)
    rows.push({ timestamp: toDateTime(atMinute(day, m)), rr: Math.round(rr * 10) / 10 })
  }
  return rows
}

export function generatePulseOxSamples(rng: Rng, day: string, model: DayModel): { timestamp: string; pulse_ox: number }[] {
  const rows: { timestamp: string; pulse_ox: number }[] = []
  for (let m = 0; m < 1440; m += PULSE_OX_STEP_MIN) {
    const asleep = isAsleep(model, m)
    const spo2 = (asleep ? model.sleepAvgSpo2 : model.spo2Avg) + rng.gaussian(0, 0.6)
    rows.push({ timestamp: toDateTime(atMinute(day, m)), pulse_ox: Math.round(Math.min(100, spo2) * 10) / 10 })
  }
  return rows
}

export function generateHrvValueSamples(rng: Rng, day: string, model: DayModel): { timestamp: string; hrv: number }[] {
  const rows: { timestamp: string; hrv: number }[] = []
  const wakeMinute = (model.sleepStartMinuteOfDay + model.sleepDurationMin) % 1440
  const samples = 6
  for (let i = 0; i < samples; i++) {
    const minuteOfDay = Math.round((wakeMinute - model.sleepDurationMin * ((samples - i) / (samples + 1)) + 1440) % 1440)
    rows.push({
      timestamp: toDateTime(atMinute(day, minuteOfDay)),
      hrv: Math.round(Math.max(5, model.hrvLastNight + rng.gaussian(0, 5)) * 10) / 10,
    })
  }
  return rows
}

export interface MonitoringBucket {
  timestamp: string
  activity_type: string
  intensity: number
  duration: string
  distance: number
  active_calories: number
  steps: number
}

export interface ClimbBucket {
  timestamp: string
  ascent: number
  descent: number
  cum_ascent: number
  cum_descent: number
}

export function generateStepBuckets(day: string, model: DayModel): MonitoringBucket[] {
  const rows: MonitoringBucket[] = []
  // distribute steps across waking 15-min buckets, weighted toward activity windows
  const bucketCount = 1440 / BUCKET_STEP_MIN
  const weights: number[] = []
  for (let b = 0; b < bucketCount; b++) {
    const m = b * BUCKET_STEP_MIN
    if (isAsleep(model, m)) {
      weights.push(0)
      continue
    }
    const activity = activityAt(model, m)
    weights.push(activity ? 6 + activity.intensity * 10 : 1)
  }
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1
  for (let b = 0; b < bucketCount; b++) {
    const m = b * BUCKET_STEP_MIN
    const asleep = isAsleep(model, m)
    const activity = activityAt(model, m)
    const steps = Math.round((weights[b] / totalWeight) * model.steps)
    rows.push({
      timestamp: toDateTime(atMinute(day, m)),
      activity_type: asleep ? 'sleeping' : activity ? 'active' : 'sedentary',
      intensity: activity ? Math.round(activity.intensity * 7) : 0,
      duration: minutesToHms(BUCKET_STEP_MIN),
      distance: Math.round(steps * 0.0007 * 1000) / 1000,
      active_calories: Math.round(steps * 0.035 + (activity ? activity.intensity * 8 : 0)),
      steps,
    })
  }
  return rows
}

export function generateClimbBuckets(rng: Rng, day: string, model: DayModel): ClimbBucket[] {
  const rows: ClimbBucket[] = []
  const bucketCount = 1440 / BUCKET_STEP_MIN
  let cumAscent = 0
  let cumDescent = 0
  for (let b = 0; b < bucketCount; b++) {
    const m = b * BUCKET_STEP_MIN
    const activity = activityAt(model, m)
    const isHike = model.activities.some(
      (a: ActivityPlan) => a.sport === 'hiking' && m >= a.startMinuteOfDay && m < a.startMinuteOfDay + a.durationMin,
    )
    let ascent = 0
    let descent = 0
    if (activity) {
      const scale = isHike ? rng.range(0.6, 2.2) : rng.range(0, 0.4)
      ascent = Math.max(0, rng.gaussian(scale, 0.3))
      descent = Math.max(0, rng.gaussian(scale * 0.9, 0.3))
    } else if (rng.chance(0.08)) {
      ascent = rng.range(0, 0.3)
      descent = rng.range(0, 0.3)
    }
    cumAscent += ascent
    cumDescent += descent
    rows.push({
      timestamp: toDateTime(atMinute(day, m)),
      ascent: Math.round(ascent * 10) / 10,
      descent: Math.round(descent * 10) / 10,
      cum_ascent: Math.round(cumAscent * 10) / 10,
      cum_descent: Math.round(cumDescent * 10) / 10,
    })
  }
  return rows
}

export function generateIntensityBuckets(
  day: string,
  model: DayModel,
): { timestamp: string; moderate_activity_time: string; vigorous_activity_time: string }[] {
  const rows: { timestamp: string; moderate_activity_time: string; vigorous_activity_time: string }[] = []
  for (const a of model.activities) {
    if (a.intensity < 0.3) continue
    const bucketStart = Math.floor(a.startMinuteOfDay / BUCKET_STEP_MIN) * BUCKET_STEP_MIN
    const moderate = a.intensity < 0.65 ? Math.min(BUCKET_STEP_MIN, a.durationMin) : 0
    const vigorous = a.intensity >= 0.65 ? Math.min(BUCKET_STEP_MIN, a.durationMin) : 0
    rows.push({
      timestamp: toDateTime(atMinute(day, bucketStart)),
      moderate_activity_time: minutesToHms(moderate),
      vigorous_activity_time: minutesToHms(vigorous),
    })
  }
  return rows
}
