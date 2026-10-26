import type { SleepStage, TimedValue, WellnessData } from './wellness'

/**
 * Turns band wellness data into rows in the same GarminDB tables the dashboard already reads, so Today, Sleep and
 * Health pick it up with no other changes. Band values take precedence over the cloud copy for the same day, since
 * they're fresher; anything the band didn't report keeps the cloud value.
 */

export interface SqlStatement {
  sql: string
  params: (string | number | null)[]
}

export interface Overlay {
  /** CREATE TABLE IF NOT EXISTS statements, for when no cloud copy of that database is loaded. */
  schema: string
  statements: SqlStatement[]
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Local wall-clock time, the format GarminDB stores. */
export function localTs(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const localDay = (t: number) => localTs(t).slice(0, 10)
/** UTC wall-clock: GarminDB stores sleep start/end and sleep events in UTC, and the Sleep page converts them. */
export function utcTs(t: number): string {
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ')
}
export function hms(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

const GARMIN_SCHEMA = `
  CREATE TABLE IF NOT EXISTS stress (timestamp TEXT PRIMARY KEY, stress INTEGER);
  CREATE TABLE IF NOT EXISTS sleep (day TEXT PRIMARY KEY, start TEXT, end TEXT, total_sleep TEXT, deep_sleep TEXT, light_sleep TEXT,
    rem_sleep TEXT, awake TEXT, avg_spo2 REAL, avg_rr REAL, avg_stress REAL, score INTEGER, qualifier TEXT);
  CREATE TABLE IF NOT EXISTS sleep_events (timestamp TEXT PRIMARY KEY, event TEXT, duration TEXT);
  CREATE TABLE IF NOT EXISTS resting_hr (day TEXT PRIMARY KEY, resting_heart_rate REAL);
  CREATE TABLE IF NOT EXISTS band_daily (day TEXT PRIMARY KEY, wake_energy INTEGER, energy_now INTEGER);
  CREATE TABLE IF NOT EXISTS hrv (day TEXT PRIMARY KEY, weekly_avg INTEGER, last_night_avg INTEGER, last_night_5min_high INTEGER,
    baseline_low INTEGER, baseline_upper INTEGER, status TEXT);
  CREATE TABLE IF NOT EXISTS daily_summary (day TEXT PRIMARY KEY, hr_min INTEGER, hr_max INTEGER, rhr INTEGER, stress_avg INTEGER,
    step_goal INTEGER, steps INTEGER, floors_up REAL, floors_goal REAL, distance REAL, calories_total INTEGER, calories_bmr INTEGER,
    calories_active INTEGER, calories_goal INTEGER, bb_charged INTEGER, bb_max INTEGER, bb_min INTEGER, spo2_avg REAL, spo2_min REAL,
    rr_waking_avg REAL, moderate_activity_time TEXT, vigorous_activity_time TEXT, intensity_time_goal TEXT, description TEXT);
`
const MONITORING_SCHEMA = `
  CREATE TABLE IF NOT EXISTS monitoring_hr (timestamp TEXT PRIMARY KEY, heart_rate INTEGER);
  CREATE TABLE IF NOT EXISTS monitoring_pulse_ox (timestamp TEXT PRIMARY KEY, pulse_ox REAL);
  CREATE TABLE IF NOT EXISTS monitoring (timestamp TEXT, activity_type TEXT, intensity INTEGER, duration TEXT, distance REAL,
    active_calories INTEGER, steps INTEGER, PRIMARY KEY (timestamp, activity_type));
`

interface DayStats {
  stress: number[]
  hr: number[]
  bb: TimedValue[]
  rhr: number | null
  stepsByType: Map<string, number>
}

function byDay(w: WellnessData): Map<string, DayStats> {
  const days = new Map<string, DayStats>()
  const get = (t: number) => {
    const k = localDay(t)
    let d = days.get(k)
    if (!d) days.set(k, (d = { stress: [], hr: [], bb: [], rhr: null, stepsByType: new Map() }))
    return d
  }
  for (const s of w.stress) if (s.v >= 0 && s.v <= 100) get(s.t).stress.push(s.v)
  for (const s of w.hr) get(s.t).hr.push(s.v)
  for (const s of w.bodyBattery) get(s.t).bb.push(s)
  for (const s of w.restingHr) get(s.t).rhr = s.v
  // Step counters are cumulative per activity type and reset once a day, but at the band's own midnight, which needn't
  // be the phone's (a freshly reset band can be on UTC). So count each sample's increase over the one before and give
  // it to the sample's local day; a drop means the counter reset, and the new value is all new steps.
  const last = new Map<string, number>()
  for (const s of [...w.steps].sort((a, b) => a.t - b.t)) {
    const prev = last.get(s.type)
    last.set(s.type, s.total)
    if (prev == null) continue // where the counter started from is unknown
    const added = s.total >= prev ? s.total - prev : s.total
    const d = get(s.t)
    d.stepsByType.set(s.type, (d.stepsByType.get(s.type) ?? 0) + added)
  }
  return days
}

export interface Night {
  day: string
  start: number
  end: number
  stages: { t: number; stage: SleepStage; seconds: number }[]
  score: number | null
}

/** Splits sleep-level samples into nights. The band logs a level only when the stage changes, so one stage can last hours; a gap of over 6 hours starts a new night. */
export function nights(w: WellnessData): Night[] {
  const levels = w.sleepLevels.filter((l) => l.stage != null) as { t: number; stage: SleepStage }[]
  const groups: (typeof levels)[] = []
  for (const l of levels) {
    const g = groups[groups.length - 1]
    if (g && l.t - g[g.length - 1].t <= 6 * 3600_000) g.push(l)
    else groups.push([l])
  }
  return groups
    .filter((g) => g.length > 1)
    .map((g) => {
      // Each level holds until the next sample; the last one is closed with the typical one-minute epoch.
      const stages = g.map((l, i) => ({ ...l, seconds: ((g[i + 1]?.t ?? l.t + 60_000) - l.t) / 1000 }))
      const start = g[0].t
      const end = g[g.length - 1].t + 60_000
      const score = w.sleepScores.filter((s) => s.t >= start - 3600_000 && s.t <= end + 12 * 3600_000).pop()?.v ?? null
      return { day: localDay(end), start, end, stages, score }
    })
}

export function wellnessOverlays(w: WellnessData): { garmin: Overlay; monitoring: Overlay } {
  const g: SqlStatement[] = []
  const m: SqlStatement[] = []

  for (const s of w.stress) g.push({ sql: 'INSERT OR REPLACE INTO stress (timestamp, stress) VALUES (?, ?)', params: [localTs(s.t), s.v] })
  for (const s of w.spo2) m.push({ sql: 'INSERT OR REPLACE INTO monitoring_pulse_ox (timestamp, pulse_ox) VALUES (?, ?)', params: [localTs(s.t), s.v] })
  for (const s of w.hr) m.push({ sql: 'INSERT OR REPLACE INTO monitoring_hr (timestamp, heart_rate) VALUES (?, ?)', params: [localTs(s.t), s.v] })
  for (const s of w.steps)
    m.push({ sql: 'INSERT OR REPLACE INTO monitoring (timestamp, activity_type, steps) VALUES (?, ?, ?)', params: [localTs(s.t), s.type, s.total] })

  for (const [day, d] of byDay(w)) {
    const mean = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)
    const bbVals = d.bb.map((b) => b.v)
    let charged = 0
    for (let i = 1; i < d.bb.length; i++) charged += Math.max(0, d.bb[i].v - d.bb[i - 1].v)
    const steps = d.stepsByType.size ? [...d.stepsByType.values()].reduce((a, b) => a + b, 0) : null
    // The day's latest Body Battery reading: the level to show as "now" (bb_charged is how much it charged, not a level).
    const latest = d.bb.reduce<{ t: number; v: number } | null>((a, b) => (!a || b.t > a.t ? b : a), null)
    if (latest) {
      g.push({ sql: 'INSERT OR IGNORE INTO band_daily (day) VALUES (?)', params: [day] })
      g.push({ sql: 'UPDATE band_daily SET energy_now = ? WHERE day = ?', params: [latest.v, day] })
    }
    g.push({ sql: 'INSERT OR IGNORE INTO daily_summary (day) VALUES (?)', params: [day] })
    g.push({
      sql: `UPDATE daily_summary SET stress_avg = COALESCE(?, stress_avg), hr_min = COALESCE(?, hr_min), hr_max = COALESCE(?, hr_max),
        rhr = COALESCE(?, rhr), steps = COALESCE(?, steps), bb_max = COALESCE(?, bb_max), bb_min = COALESCE(?, bb_min),
        bb_charged = COALESCE(?, bb_charged) WHERE day = ?`,
      params: [
        mean(d.stress),
        d.hr.length ? Math.min(...d.hr) : null,
        d.hr.length ? Math.max(...d.hr) : null,
        d.rhr,
        steps,
        bbVals.length ? Math.max(...bbVals) : null,
        bbVals.length ? Math.min(...bbVals) : null,
        d.bb.length > 1 ? charged : null,
        day,
      ],
    })
    if (d.rhr != null) g.push({ sql: 'INSERT OR REPLACE INTO resting_hr (day, resting_heart_rate) VALUES (?, ?)', params: [day, d.rhr] })
  }

  // Daily blood oxygen: average and lowest of the day's readings.
  const spo2ByDay = new Map<string, number[]>()
  for (const s of w.spo2) spo2ByDay.set(localDay(s.t), [...(spo2ByDay.get(localDay(s.t)) ?? []), s.v])
  for (const [day, vals] of spo2ByDay) {
    g.push({ sql: 'INSERT OR IGNORE INTO daily_summary (day) VALUES (?)', params: [day] })
    g.push({
      sql: 'UPDATE daily_summary SET spo2_avg = ?, spo2_min = ? WHERE day = ?',
      params: [Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, Math.min(...vals), day],
    })
  }

  // Wake-up energy: kept apart from Garmin's daily high/low so it's never mistaken for them.
  for (const e of w.wakeEnergy) {
    const day = localDay(e.t)
    g.push({ sql: 'INSERT OR IGNORE INTO band_daily (day) VALUES (?)', params: [day] })
    g.push({ sql: 'UPDATE band_daily SET wake_energy = ? WHERE day = ?', params: [e.v, day] })
  }

  for (const h of w.hrvSummaries) {
    // The summary is written on waking, so it belongs to that day.
    g.push({
      sql: 'INSERT OR REPLACE INTO hrv (day, weekly_avg, last_night_avg, last_night_5min_high, baseline_low, baseline_upper, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [localDay(h.t), h.weekly, h.lastNight, h.high5min, h.baselineLow, h.baselineHigh, h.status],
    })
  }

  // Garmin's own nightly summary (Firstbeat backup) is the source of truth for totals and score: on the real band the
  // sleep file holds only ~20 sleep-level entries a night, too few to rebuild the stages from. The stage timeline from
  // those entries is only drawn when it agrees with the summary.
  const levelNights = new Map(nights(w).map((n) => [n.day, n]))
  for (const n of w.fbtNights) {
    const day = localDay(n.end)
    const fileScore = levelNights.get(day)?.score ?? null
    g.push({
      sql: `INSERT OR REPLACE INTO sleep (day, start, end, total_sleep, deep_sleep, light_sleep, rem_sleep, awake, score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [day, utcTs(n.start), utcTs(n.end), hms((n.deep + n.light + n.rem) * 60), hms(n.deep * 60), hms(n.light * 60), hms(n.rem * 60), hms(n.awake * 60), n.score ?? fileScore],
    })
    g.push({ sql: 'INSERT OR IGNORE INTO daily_summary (day) VALUES (?)', params: [day] })
  }

  for (const n of nights(w)) {
    const total = (stage: SleepStage) => n.stages.filter((s) => s.stage === stage).reduce((a, s) => a + s.seconds, 0)
    const asleep = total('light') + total('deep') + total('rem')
    const summary = w.fbtNights.find((f) => localDay(f.end) === n.day)
    if (summary) {
      const close = (a: number, b: number) => Math.abs(a / 60 - b) <= Math.max(10, b * 0.15)
      const agrees = close(total('deep'), summary.deep) && close(total('light'), summary.light) && close(total('rem'), summary.rem) && close(total('awake'), summary.awake)
      if (!agrees) continue
    } else {
      g.push({
        sql: `INSERT OR REPLACE INTO sleep (day, start, end, total_sleep, deep_sleep, light_sleep, rem_sleep, awake, score)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [n.day, utcTs(n.start), utcTs(n.end), hms(asleep), hms(total('deep')), hms(total('light')), hms(total('rem')), hms(total('awake')), n.score],
      })
    }
    // Sleep events are stage changes, each lasting until the next change.
    let i = 0
    while (i < n.stages.length) {
      let j = i
      let seconds = 0
      while (j < n.stages.length && n.stages[j].stage === n.stages[i].stage) seconds += n.stages[j++].seconds
      const event = n.stages[i].stage === 'deep' ? 'deep_sleep' : n.stages[i].stage === 'light' ? 'light_sleep' : n.stages[i].stage === 'rem' ? 'rem_sleep' : 'awake'
      g.push({ sql: 'INSERT OR REPLACE INTO sleep_events (timestamp, event, duration) VALUES (?, ?, ?)', params: [utcTs(n.stages[i].t), event, hms(seconds)] })
      i = j
    }
  }

  return { garmin: { schema: GARMIN_SCHEMA, statements: g }, monitoring: { schema: MONITORING_SCHEMA, statements: m } }
}
