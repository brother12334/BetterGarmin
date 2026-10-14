import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { createActivitiesSchema, createGarminSchema, createMonitoringSchema, createSummarySchema } from './schema'
import type { DayModel } from './model'
import { buildActivityDetail } from './activities'
import {
  generateClimbBuckets,
  generateHrSamples,
  generateHrvValueSamples,
  generateIntensityBuckets,
  generatePulseOxSamples,
  generateRrSamples,
  generateStepBuckets,
  generateStressSamples,
} from './intraday'
import { addDays, minutesToHms, toDateTime, toDay } from './format'
import type { Rng } from './rng'

const DEVICE_SERIAL = 3425551234

function freshDb(outputDir: string, fileName: string): Database.Database {
  const filePath = path.join(outputDir, fileName)
  if (fs.existsSync(filePath)) fs.rmSync(filePath)
  const db = new Database(filePath)
  db.pragma('journal_mode = MEMORY')
  db.pragma('synchronous = OFF')
  return db
}

export function populate(outputDir: string, days: DayModel[], rng: Rng) {
  fs.mkdirSync(outputDir, { recursive: true })

  const garminDb = freshDb(outputDir, 'garmin.db')
  const monitoringDb = freshDb(outputDir, 'garmin_monitoring.db')
  const activitiesDb = freshDb(outputDir, 'garmin_activities.db')
  const summaryDb = freshDb(outputDir, 'garmin_summary.db')

  createGarminSchema(garminDb)
  createMonitoringSchema(monitoringDb)
  createActivitiesSchema(activitiesDb)
  createSummarySchema(summaryDb)

  garminDb
    .prepare('INSERT INTO devices (serial_number, timestamp, device_type, manufacturer, product, hardware_version) VALUES (?, ?, ?, ?, ?, ?)')
    .run(DEVICE_SERIAL, toDateTime(new Date(`${days[0].day}T00:00:00`)), 'fitness_watch', 'garmin', 'fenix_demo', '1.0')

  // --- prepared statements -------------------------------------------------
  const insWeight = garminDb.prepare('INSERT INTO weight (day, weight) VALUES (?, ?)')
  const insStress = garminDb.prepare('INSERT INTO stress (timestamp, stress) VALUES (?, ?)')
  const insSleep = garminDb.prepare(
    'INSERT INTO sleep (day, start, end, total_sleep, deep_sleep, light_sleep, rem_sleep, awake, avg_spo2, avg_rr, avg_stress, score, qualifier) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  )
  const insSleepEvent = garminDb.prepare('INSERT INTO sleep_events (timestamp, event, duration) VALUES (?, ?, ?)')
  const insRestingHr = garminDb.prepare('INSERT INTO resting_hr (day, resting_heart_rate) VALUES (?, ?)')
  const insHrv = garminDb.prepare(
    'INSERT INTO hrv (day, weekly_avg, last_night_avg, last_night_5min_high, baseline_low, baseline_upper, status) VALUES (?,?,?,?,?,?,?)',
  )
  const insDailySummary = garminDb.prepare(`
    INSERT INTO daily_summary (
      day, hr_min, hr_max, rhr, stress_avg, step_goal, steps,
      moderate_activity_time, vigorous_activity_time, intensity_time_goal,
      floors_up, floors_down, floors_goal, distance,
      calories_goal, calories_total, calories_bmr, calories_active, calories_consumed,
      hydration_goal, hydration_intake, sweat_loss,
      spo2_avg, spo2_min, rr_waking_avg, rr_max, rr_min,
      bb_charged, bb_max, bb_min, description
    ) VALUES (${Array(31).fill('?').join(',')})
  `)

  const insMonitoringHr = monitoringDb.prepare('INSERT INTO monitoring_hr (timestamp, heart_rate) VALUES (?, ?)')
  const insRr = monitoringDb.prepare('INSERT INTO monitoring_rr (timestamp, rr) VALUES (?, ?)')
  const insPulseOx = monitoringDb.prepare('INSERT INTO monitoring_pulse_ox (timestamp, pulse_ox) VALUES (?, ?)')
  const insHrvValue = monitoringDb.prepare('INSERT INTO monitoring_hrv_value (timestamp, hrv) VALUES (?, ?)')
  const insHrvStatus = monitoringDb.prepare(
    'INSERT INTO monitoring_hrv_status (timestamp, weekly_average, last_night, last_night_average, baseline_low, baseline_high, status, reading_count) VALUES (?,?,?,?,?,?,?,?)',
  )
  const insMonitoring = monitoringDb.prepare(
    'INSERT INTO monitoring (timestamp, activity_type, intensity, duration, distance, active_calories, steps) VALUES (?,?,?,?,?,?,?)',
  )
  const insClimb = monitoringDb.prepare('INSERT INTO monitoring_climb (timestamp, ascent, descent, cum_ascent, cum_descent) VALUES (?,?,?,?,?)')
  const insIntensity = monitoringDb.prepare(
    'INSERT INTO monitoring_intensity (timestamp, moderate_activity_time, vigorous_activity_time) VALUES (?,?,?)',
  )

  const insActivity = activitiesDb.prepare(`
    INSERT INTO activities (
      activity_id, name, description, type, sport, sub_sport, start_time, stop_time, elapsed_time, moving_time,
      distance, calories, avg_hr, max_hr, avg_cadence, max_cadence, avg_speed, max_speed,
      ascent, descent, start_lat, start_long, stop_lat, stop_long,
      training_load, training_effect, anaerobic_training_effect, laps, course_id, device_serial_number
    ) VALUES (${Array(30).fill('?').join(',')})
  `)
  const insLap = activitiesDb.prepare(`
    INSERT INTO activity_laps (activity_id, lap, start_time, stop_time, elapsed_time, moving_time, distance, avg_hr, max_hr, avg_speed, max_speed, ascent, descent, calories)
    VALUES (${Array(14).fill('?').join(',')})
  `)
  const insRecord = activitiesDb.prepare(`
    INSERT INTO activity_records (activity_id, record, timestamp, position_lat, position_long, distance, cadence, altitude, hr, speed, temperature)
    VALUES (${Array(11).fill('?').join(',')})
  `)
  const insStepsActivity = activitiesDb.prepare(
    'INSERT INTO steps_activities (activity_id, steps, avg_pace, avg_moving_pace, max_pace, avg_steps_per_min, max_steps_per_min, vo2_max) VALUES (?,?,?,?,?,?,?,?)',
  )
  const insCycleActivity = activitiesDb.prepare('INSERT INTO cycle_activities (activity_id, strokes, vo2_max) VALUES (?,?,?)')
  const insPaddleActivity = activitiesDb.prepare('INSERT INTO paddle_activities (activity_id, strokes, avg_stroke_distance) VALUES (?,?,?)')
  const insClimbingActivity = activitiesDb.prepare('INSERT INTO climbing_activities (activity_id, total_routes) VALUES (?,?)')

  // --- day-by-day population -------------------------------------------------
  let activityCounter = 0

  const runGarmin = garminDb.transaction((model: DayModel) => {
    if (model.weight != null) insWeight.run(model.day, model.weight)

    for (const s of generateStressSamples(rng, model.day, model)) insStress.run(s.timestamp, s.stress)

    const sleepStartDate = addDays(new Date(`${model.day}T00:00:00`), 0)
    sleepStartDate.setMinutes(sleepStartDate.getMinutes() + model.sleepStartMinuteOfDay)
    const sleepEndDate = new Date(sleepStartDate.getTime() + model.sleepDurationMin * 60000)
    insSleep.run(
      model.day,
      toDateTime(sleepStartDate),
      toDateTime(sleepEndDate),
      minutesToHms(model.deepMin + model.lightMin + model.remMin),
      minutesToHms(model.deepMin),
      minutesToHms(model.lightMin),
      minutesToHms(model.remMin),
      minutesToHms(model.awakeMin),
      model.sleepAvgSpo2,
      model.sleepAvgRr,
      model.sleepAvgStress,
      model.sleepScore,
      model.sleepQualifier,
    )

    // sleep_events: alternating light/deep/rem cycles plus one awakening
    const cycles = 4
    let cursor = new Date(sleepStartDate)
    const cycleLight = model.lightMin / cycles
    const cycleDeep = model.deepMin / cycles
    const cycleRem = model.remMin / cycles
    for (let c = 0; c < cycles; c++) {
      for (const [event, minutes] of [
        ['light_sleep', cycleLight * 0.5],
        ['deep_sleep', cycleDeep],
        ['light_sleep', cycleLight * 0.5],
        ['rem_sleep', cycleRem],
      ] as const) {
        if (minutes < 0.5) continue
        insSleepEvent.run(toDateTime(cursor), event, minutesToHms(minutes))
        cursor = new Date(cursor.getTime() + minutes * 60000)
      }
    }
    insSleepEvent.run(toDateTime(cursor), 'awake', minutesToHms(model.awakeMin))

    insRestingHr.run(model.day, model.rhr)
    insHrv.run(
      model.day,
      model.hrvWeeklyAvg,
      model.hrvLastNight,
      Math.round(model.hrvLastNight * 1.3),
      model.hrvBaselineLow,
      model.hrvBaselineHigh,
      model.hrvLastNight < model.hrvBaselineLow ? 'low' : model.hrvLastNight > model.hrvBaselineHigh ? 'balanced' : 'balanced',
    )

    const hrSamplesForDay = generateHrSamples(rng, model.day, model)
    insDailySummary.run(
      model.day,
      Math.min(...hrSamplesForDay.map((h: { heart_rate: number }) => h.heart_rate)),
      Math.max(...hrSamplesForDay.map((h: { heart_rate: number }) => h.heart_rate)),
      model.rhr,
      model.stressAvg,
      10000,
      model.steps,
      minutesToHms(model.moderateMin),
      minutesToHms(model.vigorousMin),
      minutesToHms(150),
      model.floorsUp,
      model.floorsUp,
      10,
      model.distanceKm,
      2200,
      model.caloriesBmr + model.caloriesActive,
      model.caloriesBmr,
      model.caloriesActive,
      model.caloriesConsumed,
      2700,
      Math.round(model.caloriesConsumed * 0.4),
      Math.round(model.caloriesActive * 0.3),
      model.spo2Avg,
      model.spo2Min,
      model.rrWakingAvg,
      model.rrMax,
      model.rrMin,
      model.bbCharged,
      model.bbMax,
      model.bbMin,
      null,
    )
  })

  const runMonitoring = monitoringDb.transaction((model: DayModel) => {
    for (const h of generateHrSamples(rng, model.day, model)) insMonitoringHr.run(h.timestamp, h.heart_rate)
    for (const r of generateRrSamples(rng, model.day, model)) insRr.run(r.timestamp, r.rr)
    for (const p of generatePulseOxSamples(rng, model.day, model)) insPulseOx.run(p.timestamp, p.pulse_ox)
    for (const v of generateHrvValueSamples(rng, model.day, model)) insHrvValue.run(v.timestamp, v.hrv)
    insHrvStatus.run(
      toDateTime(addDays(new Date(`${model.day}T06:00:00`), 0)),
      model.hrvWeeklyAvg,
      model.hrvLastNight,
      model.hrvLastNight,
      model.hrvBaselineLow,
      model.hrvBaselineHigh,
      model.hrvLastNight < model.hrvBaselineLow ? 2 : model.hrvLastNight > model.hrvBaselineHigh ? 4 : 3,
      rng.int(4, 7),
    )
    for (const b of generateStepBuckets(model.day, model))
      insMonitoring.run(b.timestamp, b.activity_type, b.intensity, b.duration, b.distance, b.active_calories, b.steps)
    for (const c of generateClimbBuckets(rng, model.day, model)) insClimb.run(c.timestamp, c.ascent, c.descent, c.cum_ascent, c.cum_descent)
    for (const i of generateIntensityBuckets(model.day, model)) insIntensity.run(i.timestamp, i.moderate_activity_time, i.vigorous_activity_time)
  })

  const runActivities = activitiesDb.transaction((model: DayModel) => {
    for (const plan of model.activities) {
      const detail = buildActivityDetail(rng, model.day, plan, activityCounter++, model.rhr, model.fitness, DEVICE_SERIAL)
      const a = detail.activity
      insActivity.run(
        a.activity_id, a.name, a.description, a.type, a.sport, a.sub_sport, a.start_time, a.stop_time, a.elapsed_time, a.moving_time,
        a.distance, a.calories, a.avg_hr, a.max_hr, a.avg_cadence, a.max_cadence, a.avg_speed, a.max_speed,
        a.ascent, a.descent, a.start_lat, a.start_long, a.stop_lat, a.stop_long,
        a.training_load, a.training_effect, a.anaerobic_training_effect, a.laps, a.course_id, a.device_serial_number,
      )
      for (const lap of detail.laps) {
        insLap.run(
          lap.activity_id, lap.lap, lap.start_time, lap.stop_time, lap.elapsed_time, lap.moving_time,
          lap.distance, lap.avg_hr, lap.max_hr, lap.avg_speed, lap.max_speed, lap.ascent, lap.descent, lap.calories,
        )
      }
      for (const r of detail.records) {
        insRecord.run(r.activity_id, r.record, r.timestamp, r.position_lat, r.position_long, r.distance, r.cadence, r.altitude, r.hr, r.speed, r.temperature)
      }
      if (detail.stepsActivity) {
        insStepsActivity.run(
          a.activity_id, detail.stepsActivity.steps, detail.stepsActivity.avg_pace, detail.stepsActivity.avg_moving_pace,
          detail.stepsActivity.max_pace, detail.stepsActivity.avg_steps_per_min, detail.stepsActivity.max_steps_per_min, detail.stepsActivity.vo2_max,
        )
      }
      if (detail.cycleActivity) insCycleActivity.run(a.activity_id, detail.cycleActivity.strokes, detail.cycleActivity.vo2_max)
      if (detail.paddleActivity) insPaddleActivity.run(a.activity_id, detail.paddleActivity.strokes, detail.paddleActivity.avg_stroke_distance)
      if (detail.climbingActivity) insClimbingActivity.run(a.activity_id, detail.climbingActivity.total_routes)
    }
  })

  for (const model of days) {
    runGarmin(model)
    runMonitoring(model)
    runActivities(model)
  }

  populateSummary(summaryDb, days)

  garminDb.close()
  monitoringDb.close()
  activitiesDb.close()
  summaryDb.close()
}

interface Bucket {
  firstDay: string
  days: DayModel[]
}

function bucketsFor(days: DayModel[], unit: 'week' | 'month' | 'year'): Bucket[] {
  const buckets = new Map<string, DayModel[]>()
  for (const d of days) {
    const date = new Date(`${d.day}T00:00:00`)
    let key: string
    if (unit === 'week') {
      const monday = new Date(date)
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      key = toDay(monday)
    } else if (unit === 'month') {
      key = `${d.day.slice(0, 7)}-01`
    } else {
      key = `${d.day.slice(0, 4)}-01-01`
    }
    const arr = buckets.get(key) ?? []
    arr.push(d)
    buckets.set(key, arr)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([firstDay, bucketDays]) => ({ firstDay, days: bucketDays }))
}

function avg(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n))
  if (valid.length === 0) return null
  return Math.round((valid.reduce((s, n) => s + n, 0) / valid.length) * 10) / 10
}

function populateSummary(summaryDb: Database.Database, days: DayModel[]) {
  const insSummary = (table: string) =>
    summaryDb.prepare(`
      INSERT INTO ${table} (
        day_or_first_day, hr_avg, hr_min, hr_max, rhr_avg, inactive_hr_avg, weight_avg,
        steps, steps_goal, floors, floors_goal, sleep_avg, rem_sleep_avg, stress_avg,
        calories_avg, calories_bmr_avg, calories_active_avg, calories_goal,
        activities, activities_calories, activities_distance, spo2_avg, spo2_min, bb_max, bb_min
      ) VALUES (${Array(25).fill('?').join(',')})
    `.replace('day_or_first_day', table === 'days_summary' ? 'day' : 'first_day'))

  const run = (table: string, rows: { key: string; days: DayModel[] }[]) => {
    const stmt = insSummary(table)
    const tx = summaryDb.transaction(() => {
      for (const row of rows) {
        const d = row.days
        stmt.run(
          row.key,
          avg(d.map((x) => x.rhr + 15)),
          avg(d.map((x) => x.rhr)),
          avg(d.map((x) => x.rhr + 40)),
          avg(d.map((x) => x.rhr)),
          avg(d.map((x) => x.rhr + 8)),
          avg(d.map((x) => x.weight ?? NaN)),
          Math.round(avg(d.map((x) => x.steps)) ?? 0),
          10000,
          avg(d.map((x) => x.floorsUp)),
          10,
          avg(d.map((x) => x.sleepDurationMin)) != null ? minutesToHms(avg(d.map((x) => x.sleepDurationMin)) as number) : null,
          avg(d.map((x) => x.remMin)) != null ? minutesToHms(avg(d.map((x) => x.remMin)) as number) : null,
          avg(d.map((x) => x.stressAvg)),
          avg(d.map((x) => x.caloriesBmr + x.caloriesActive)),
          avg(d.map((x) => x.caloriesBmr)),
          avg(d.map((x) => x.caloriesActive)),
          2200,
          d.reduce((s, x) => s + x.activities.length, 0),
          Math.round(d.reduce((s, x) => s + x.activities.length, 0) * 450),
          Math.round(
            d.reduce((s: number, x) => s + x.activities.reduce((s2: number, a) => s2 + (a.distanceKm ?? 0), 0), 0) * 100,
          ) / 100,
          avg(d.map((x) => x.spo2Avg)),
          avg(d.map((x) => x.spo2Min)),
          Math.max(...d.map((x) => x.bbMax)),
          Math.min(...d.map((x) => x.bbMin)),
        )
      }
    })
    tx()
  }
  run('days_summary', days.map((d) => ({ key: d.day, days: [d] })))
  run('weeks_summary', bucketsFor(days, 'week').map((b) => ({ key: b.firstDay, days: b.days })))
  run('months_summary', bucketsFor(days, 'month').map((b) => ({ key: b.firstDay, days: b.days })))
  run('years_summary', bucketsFor(days, 'year').map((b) => ({ key: b.firstDay, days: b.days })))
}
