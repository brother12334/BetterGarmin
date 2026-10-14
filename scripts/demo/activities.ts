import { addDays, secondsToHms, toDateTime } from './format'
import type { Rng } from './rng'
import type { ActivityPlan, Sport } from './model'
import { planStrengthWorkout, SPLIT_NAMES, type PlannedSet } from '../../src/lib/strengthPlans'

export interface ActivityRecordRow {
  activity_id: string
  record: number
  timestamp: string
  position_lat: number | null
  position_long: number | null
  distance: number
  cadence: number | null
  altitude: number | null
  hr: number
  speed: number
  temperature: number
}

export interface ActivityLapRow {
  activity_id: string
  lap: number
  start_time: string
  stop_time: string
  elapsed_time: string
  moving_time: string
  distance: number
  avg_hr: number
  max_hr: number
  avg_speed: number
  max_speed: number
  ascent: number
  descent: number
  calories: number
}

export interface ActivityRow {
  activity_id: string
  name: string
  description: string | null
  type: string
  sport: string
  sub_sport: string
  start_time: string
  stop_time: string
  elapsed_time: string
  moving_time: string
  distance: number | null
  calories: number
  avg_hr: number
  max_hr: number
  avg_rr: number | null
  max_rr: number | null
  avg_cadence: number | null
  max_cadence: number | null
  avg_speed: number | null
  max_speed: number | null
  ascent: number
  descent: number
  start_lat: number | null
  start_long: number | null
  stop_lat: number | null
  stop_long: number | null
  training_load: number
  training_effect: number
  anaerobic_training_effect: number
  self_eval_feel: number | null
  self_eval_effort: number | null
  laps: number
  course_id: null
  device_serial_number: number
}

export interface ActivityDetail {
  activity: ActivityRow
  laps: ActivityLapRow[]
  records: ActivityRecordRow[]
  stepsActivity: { steps: number; avg_pace: string; avg_moving_pace: string; max_pace: string; avg_steps_per_min: number; max_steps_per_min: number; vo2_max: number | null } | null
  cycleActivity: { strokes: null; vo2_max: number | null } | null
  paddleActivity: { strokes: number; avg_stroke_distance: number } | null
  climbingActivity: { total_routes: number } | null
  /** Only set for strength_training plans. Not part of GarminDB's real schema (it drops this data) — seeded separately into the app's own manual-log store for demo mode. */
  strengthSets?: PlannedSet[]
}

const SPORT_FIELDS: Record<Exclude<Sport, 'strength_training'>, { sport: string; sub_sport: string; nameOptions: string[] }> = {
  running: { sport: 'running', sub_sport: 'generic', nameOptions: ['Morning Run', 'Neighborhood Run', 'Easy Run', 'Tempo Run'] },
  walking: { sport: 'walking', sub_sport: 'generic', nameOptions: ['Walk', 'Evening Walk', 'Lunch Walk'] },
  hiking: { sport: 'hiking', sub_sport: 'generic', nameOptions: ['Trail Hike', 'Ridge Hike', 'Weekend Hike'] },
  cycling: { sport: 'cycling', sub_sport: 'road', nameOptions: ['Road Ride', 'Morning Ride', 'Interval Ride'] },
  paddling: { sport: 'stand_up_paddleboarding', sub_sport: 'generic', nameOptions: ['SUP Session', 'Lake Paddle'] },
  climbing: { sport: 'rock_climbing', sub_sport: 'generic', nameOptions: ['Climbing Session', 'Gym Climb'] },
}

const HOME_LAT = 47.6062
const HOME_LON = -122.3321

function buildRoute(rng: Rng, numPoints: number, totalDistanceKm: number): { lat: number; lon: number; dist: number }[] {
  const points: { lat: number; lon: number; dist: number }[] = [{ lat: HOME_LAT, lon: HOME_LON, dist: 0 }]
  const half = Math.floor(numPoints / 2)
  let heading = rng.range(0, Math.PI * 2)
  const stepDist = totalDistanceKm / numPoints

  for (let i = 1; i <= half; i++) {
    heading += rng.gaussian(0, 0.25)
    const kmPerDegLat = 1 / 110.574
    const kmPerDegLon = 1 / (111.32 * Math.cos((HOME_LAT * Math.PI) / 180))
    const prev = points[points.length - 1]
    points.push({
      lat: prev.lat + Math.cos(heading) * stepDist * kmPerDegLat,
      lon: prev.lon + Math.sin(heading) * stepDist * kmPerDegLon,
      dist: prev.dist + stepDist,
    })
  }
  // mirror back toward home for an out-and-back feel, with slight jitter so it's not identical
  for (let i = half + 1; i <= numPoints; i++) {
    const mirrorIdx = numPoints - i
    const base = points[Math.min(mirrorIdx, points.length - 1)]
    const prev = points[points.length - 1]
    points.push({
      lat: base.lat + rng.gaussian(0, 0.0004),
      lon: base.lon + rng.gaussian(0, 0.0004),
      dist: prev.dist + stepDist,
    })
  }
  return points
}

function buildStrengthActivityDetail(
  rng: Rng,
  day: string,
  plan: ActivityPlan,
  activityIndex: number,
  rhr: number,
  fitness: number,
  deviceSerial: number,
): ActivityDetail {
  const startDate = addDays(new Date(`${day}T00:00:00`), 0)
  startDate.setMinutes(startDate.getMinutes() + plan.startMinuteOfDay)
  const activityId = `${Math.floor(startDate.getTime() / 1000)}${activityIndex}`
  const durationSec = Math.round(plan.durationMin * 60)
  const stopDate = new Date(startDate.getTime() + durationSec * 1000)

  const split = plan.split ?? 'full_body'
  const sets = planStrengthWorkout(rng, split, fitness, 1 + rng.gaussian(0, 0.05))

  // HR oscillates between working-set highs and between-set rest, cycling roughly once per exercise.
  const maxHr = Math.round(188 - fitness * 8)
  const workingHr = rhr + (maxHr - rhr) * (0.55 + plan.intensity * 0.3)
  const restingDuringSession = rhr + (maxHr - rhr) * 0.15
  const cycles = Math.max(5, Math.min(20, sets.length))
  const n = Math.max(30, Math.round(durationSec / 20))
  const records: ActivityRecordRow[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1)
    const warmup = Math.min(1, t / 0.08)
    const cooldown = t > 0.92 ? 1 - (t - 0.92) / 0.08 : 1
    const cyclePhase = (t * cycles) % 1
    const target = cyclePhase < 0.45 ? workingHr : restingDuringSession
    const hr = Math.round(rhr + (target - rhr) * warmup * cooldown + rng.gaussian(0, 3))
    records.push({
      activity_id: activityId,
      record: i,
      timestamp: toDateTime(new Date(startDate.getTime() + t * durationSec * 1000)),
      position_lat: null,
      position_long: null,
      distance: 0,
      cadence: null,
      altitude: null,
      hr: Math.max(rhr - 5, hr),
      speed: 0,
      temperature: Math.round(rng.gaussian(21, 1) * 10) / 10,
    })
  }

  const avgHr = Math.round(records.reduce((s, r) => s + r.hr, 0) / records.length)
  const maxHrActual = Math.max(...records.map((r) => r.hr))
  const avgRr = Math.round(rng.gaussian(24, 3) * 10) / 10
  const maxRr = Math.round((avgRr + rng.range(6, 12)) * 10) / 10

  const calories = Math.round(durationSec * (0.07 + plan.intensity * 0.06))
  const trainingLoad = Math.round(plan.durationMin * Math.pow(plan.intensity, 1.5) * 9) / 10
  const trainingEffect = Math.round(Math.min(5, 1 + plan.intensity * 3.5) * 10) / 10
  const anaerobicEffect = Math.round(Math.max(0, plan.intensity - 0.5) * 3.5 * 10) / 10
  const selfEvalEffort = Math.max(1, Math.min(5, Math.round(1 + plan.intensity * 4 + rng.gaussian(0, 0.4))))
  const selfEvalFeel = Math.max(1, Math.min(5, Math.round(rng.gaussian(3.4, 0.9))))

  const activity: ActivityRow = {
    activity_id: activityId,
    name: SPLIT_NAMES[split],
    description: null,
    type: 'activity',
    sport: 'training',
    sub_sport: 'strength_training',
    start_time: toDateTime(startDate),
    stop_time: toDateTime(stopDate),
    elapsed_time: secondsToHms(durationSec),
    moving_time: secondsToHms(durationSec * 0.7),
    distance: null,
    calories,
    avg_hr: avgHr,
    max_hr: maxHrActual,
    avg_rr: avgRr,
    max_rr: maxRr,
    avg_cadence: null,
    max_cadence: null,
    avg_speed: null,
    max_speed: null,
    ascent: 0,
    descent: 0,
    start_lat: null,
    start_long: null,
    stop_lat: null,
    stop_long: null,
    training_load: trainingLoad,
    training_effect: trainingEffect,
    anaerobic_training_effect: anaerobicEffect,
    self_eval_feel: selfEvalFeel,
    self_eval_effort: selfEvalEffort,
    laps: 0,
    course_id: null,
    device_serial_number: deviceSerial,
  }

  return {
    activity,
    laps: [],
    records,
    stepsActivity: null,
    cycleActivity: null,
    paddleActivity: null,
    climbingActivity: null,
    strengthSets: sets,
  }
}

export function buildActivityDetail(
  rng: Rng,
  day: string,
  plan: ActivityPlan,
  activityIndex: number,
  rhr: number,
  fitness: number,
  deviceSerial: number,
): ActivityDetail {
  if (plan.sport === 'strength_training') {
    return buildStrengthActivityDetail(rng, day, plan, activityIndex, rhr, fitness, deviceSerial)
  }
  const fields = SPORT_FIELDS[plan.sport]
  const startDate = addDays(new Date(`${day}T00:00:00`), 0)
  startDate.setMinutes(startDate.getMinutes() + plan.startMinuteOfDay)
  const activityId = `${Math.floor(startDate.getTime() / 1000)}${activityIndex}`

  const durationSec = Math.round(plan.durationMin * 60)
  const hasGps = plan.sport !== 'climbing'
  const targetPoints = Math.max(20, Math.min(280, Math.round(durationSec / 12)))
  const distanceKm = plan.distanceKm ?? 0
  const route = hasGps ? buildRoute(rng, targetPoints, distanceKm) : []

  const maxHr = Math.round(188 - fitness * 8)
  const restHr = rhr
  const targetHr = restHr + (maxHr - restHr) * (0.45 + plan.intensity * 0.5)

  const records: ActivityRecordRow[] = []
  const n = Math.max(route.length, targetPoints)
  let elevation = plan.sport === 'hiking' ? rng.range(80, 300) : rng.range(10, 60)
  const elevationAmplitude = plan.sport === 'hiking' ? 60 : plan.sport === 'cycling' ? 25 : 8

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1)
    const warmup = Math.min(1, t / 0.12)
    const cooldown = t > 0.9 ? 1 - (t - 0.9) / 0.1 : 1
    const hr = Math.round(restHr + (targetHr - restHr) * warmup * cooldown + rng.gaussian(0, 3))
    elevation += Math.sin(t * Math.PI * 3 + rng.range(0, 1)) * (elevationAmplitude * 0.04) + rng.gaussian(0, 0.3)
    const speedKmh = distanceKm > 0 ? (distanceKm / (durationSec / 3600)) * (0.8 + warmup * 0.2) : 0
    const cadence =
      plan.sport === 'running'
        ? Math.round(rng.gaussian(160 + fitness * 8, 4))
        : plan.sport === 'walking'
          ? Math.round(rng.gaussian(112, 5))
          : plan.sport === 'hiking'
            ? Math.round(rng.gaussian(100, 6))
            : plan.sport === 'cycling'
              ? Math.round(rng.gaussian(82, 6))
              : null

    const point = route[Math.min(i, route.length - 1)]
    const timestamp = new Date(startDate.getTime() + t * durationSec * 1000)

    records.push({
      activity_id: activityId,
      record: i,
      timestamp: toDateTime(timestamp),
      position_lat: hasGps ? Math.round((point?.lat ?? HOME_LAT) * 1e6) / 1e6 : null,
      position_long: hasGps ? Math.round((point?.lon ?? HOME_LON) * 1e6) / 1e6 : null,
      distance: Math.round((point?.dist ?? distanceKm * t) * 1000) / 1000,
      cadence,
      altitude: Math.round(elevation * 10) / 10,
      hr: Math.max(restHr - 5, hr),
      speed: Math.round(speedKmh * 100) / 100,
      temperature: Math.round(rng.gaussian(18, 4) * 10) / 10,
    })
  }

  const avgHr = Math.round(records.reduce((s, r) => s + r.hr, 0) / records.length)
  const maxHrActual = Math.max(...records.map((r) => r.hr))
  const avgSpeed = records.length ? records.reduce((s, r) => s + r.speed, 0) / records.length : 0
  const maxSpeed = records.length ? Math.max(...records.map((r) => r.speed)) : 0
  let ascent = 0
  let descent = 0
  for (let i = 1; i < records.length; i++) {
    const delta = (records[i].altitude ?? 0) - (records[i - 1].altitude ?? 0)
    if (delta > 0) ascent += delta
    else descent += -delta
  }

  const stopDate = new Date(startDate.getTime() + durationSec * 1000)
  const calories = Math.round(durationSec * (0.09 + plan.intensity * 0.09))
  const trainingLoad = Math.round(plan.durationMin * Math.pow(plan.intensity, 1.5) * 10) / 10
  const trainingEffect = Math.round(Math.min(5, 1 + plan.intensity * 4) * 10) / 10
  const anaerobicEffect = Math.round(Math.max(0, plan.intensity - 0.6) * 5 * 10) / 10

  // laps: ~1 per km for foot sports, ~1 per 8km for cycling, else time-based every ~12 min
  const lapCount =
    plan.sport === 'cycling'
      ? Math.max(1, Math.round(distanceKm / 8))
      : plan.sport === 'climbing'
        ? Math.max(1, Math.round(plan.durationMin / 15))
        : Math.max(1, Math.round(distanceKm || plan.durationMin / 12))
  const laps: ActivityLapRow[] = []
  const recordsPerLap = Math.max(1, Math.floor(records.length / lapCount))
  for (let lap = 0; lap < lapCount; lap++) {
    const slice = records.slice(lap * recordsPerLap, lap === lapCount - 1 ? records.length : (lap + 1) * recordsPerLap)
    if (slice.length === 0) continue
    const lapStart = new Date(slice[0].timestamp.replace(' ', 'T'))
    const lapEnd = new Date(slice[slice.length - 1].timestamp.replace(' ', 'T'))
    const lapAscent = slice.reduce((s, r, idx) => (idx === 0 ? 0 : s + Math.max(0, (r.altitude ?? 0) - (slice[idx - 1].altitude ?? 0))), 0)
    const lapDescent = slice.reduce((s, r, idx) => (idx === 0 ? 0 : s + Math.max(0, (slice[idx - 1].altitude ?? 0) - (r.altitude ?? 0))), 0)
    laps.push({
      activity_id: activityId,
      lap: lap + 1,
      start_time: toDateTime(lapStart),
      stop_time: toDateTime(lapEnd),
      elapsed_time: secondsToHms((lapEnd.getTime() - lapStart.getTime()) / 1000),
      moving_time: secondsToHms((lapEnd.getTime() - lapStart.getTime()) / 1000),
      distance: Math.round((slice[slice.length - 1].distance - slice[0].distance) * 1000) / 1000,
      avg_hr: Math.round(slice.reduce((s, r) => s + r.hr, 0) / slice.length),
      max_hr: Math.max(...slice.map((r) => r.hr)),
      avg_speed: Math.round((slice.reduce((s, r) => s + r.speed, 0) / slice.length) * 100) / 100,
      max_speed: Math.round(Math.max(...slice.map((r) => r.speed)) * 100) / 100,
      ascent: Math.round(lapAscent * 10) / 10,
      descent: Math.round(lapDescent * 10) / 10,
      calories: Math.round(calories / lapCount),
    })
  }

  const name = rng.choice(fields.nameOptions)
  const vo2Max =
    (plan.sport === 'running' || plan.sport === 'cycling') && rng.chance(0.2)
      ? Math.round((plan.sport === 'running' ? 40 + fitness * 12 : 43 + fitness * 13) * 10) / 10
      : null

  const stepsPerMin = plan.sport === 'running' || plan.sport === 'walking' || plan.sport === 'hiking'
    ? Math.round(records.reduce((s, r) => s + (r.cadence ?? 0), 0) / records.length)
    : null

  const activity: ActivityRow = {
    activity_id: activityId,
    name,
    description: null,
    type: 'activity',
    sport: fields.sport,
    sub_sport: fields.sub_sport,
    start_time: toDateTime(startDate),
    stop_time: toDateTime(stopDate),
    elapsed_time: secondsToHms(durationSec),
    moving_time: secondsToHms(durationSec * 0.96),
    distance: Math.round(distanceKm * 1000) / 1000,
    calories,
    avg_hr: avgHr,
    max_hr: maxHrActual,
    avg_rr: null,
    max_rr: null,
    avg_cadence: stepsPerMin,
    max_cadence: stepsPerMin ? Math.round(stepsPerMin * 1.08) : null,
    avg_speed: Math.round(avgSpeed * 100) / 100,
    max_speed: Math.round(maxSpeed * 100) / 100,
    ascent: Math.round(ascent * 10) / 10,
    descent: Math.round(descent * 10) / 10,
    start_lat: hasGps ? HOME_LAT : null,
    start_long: hasGps ? HOME_LON : null,
    stop_lat: hasGps ? route[route.length - 1]?.lat ?? HOME_LAT : null,
    stop_long: hasGps ? route[route.length - 1]?.lon ?? HOME_LON : null,
    training_load: trainingLoad,
    training_effect: trainingEffect,
    anaerobic_training_effect: anaerobicEffect,
    self_eval_feel: null,
    self_eval_effort: null,
    laps: laps.length,
    course_id: null,
    device_serial_number: deviceSerial,
  }

  const paceMinPerKm = distanceKm > 0 ? durationSec / 60 / distanceKm : 0

  return {
    activity,
    laps,
    records,
    stepsActivity:
      plan.sport === 'running' || plan.sport === 'walking' || plan.sport === 'hiking'
        ? {
            steps: Math.round((distanceKm * 1000) / (plan.sport === 'running' ? 1.1 : 0.78)),
            avg_pace: secondsToHms(paceMinPerKm * 60),
            avg_moving_pace: secondsToHms(paceMinPerKm * 60 * 0.98),
            max_pace: secondsToHms(paceMinPerKm * 60 * 0.82),
            avg_steps_per_min: stepsPerMin ?? 0,
            max_steps_per_min: stepsPerMin ? Math.round(stepsPerMin * 1.1) : 0,
            vo2_max: plan.sport !== 'walking' ? vo2Max : null,
          }
        : null,
    cycleActivity: plan.sport === 'cycling' ? { strokes: null, vo2_max: vo2Max } : null,
    paddleActivity:
      plan.sport === 'paddling'
        ? { strokes: Math.round(plan.durationMin * 30), avg_stroke_distance: 1.8 }
        : null,
    climbingActivity: plan.sport === 'climbing' ? { total_routes: rng.int(4, 14) } : null,
  }
}
