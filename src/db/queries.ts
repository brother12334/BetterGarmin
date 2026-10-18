import { sqliteClient } from './client'
import type {
  ActivityLapRow,
  ActivityRecordRow,
  ActivityRow,
  DailySummaryRow,
  HrvRow,
  RestingHrRow,
  SleepEventRow,
  SleepRow,
  StressRow,
  WeightRow,
} from './types'

/**
 * GarminDB data is static until the user re-syncs, so "today" means the most
 * recent day present in the database rather than the calendar date.
 */
/**
 * The newest day worth showing: not after today on this device, and with something recorded. The cloud sync runs
 * in UTC, so in the evening it can already hold an empty row for "tomorrow".
 */
export async function getLatestDay(): Promise<string | null> {
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const rows = await sqliteClient.query<{ day: string | null }>(
    'garmin',
    `SELECT COALESCE(
       (SELECT MAX(day) FROM daily_summary WHERE day <= ? AND (steps > 0 OR stress_avg IS NOT NULL OR bb_charged IS NOT NULL)),
       (SELECT MAX(day) FROM daily_summary WHERE day <= ?),
       (SELECT MAX(day) FROM daily_summary)
     ) as day`,
    [today, today],
  )
  return rows[0]?.day ?? null
}

export async function getDailySummary(day: string): Promise<DailySummaryRow | null> {
  const rows = await sqliteClient.query<DailySummaryRow>(
    'garmin',
    'SELECT * FROM daily_summary WHERE day = ?',
    [day],
  )
  return rows[0] ?? null
}

export async function getDailySummaryRange(startDay: string, endDay: string): Promise<DailySummaryRow[]> {
  return sqliteClient.query<DailySummaryRow>(
    'garmin',
    'SELECT * FROM daily_summary WHERE day BETWEEN ? AND ? ORDER BY day ASC',
    [startDay, endDay],
  )
}

export async function getSleep(day: string): Promise<SleepRow | null> {
  const rows = await sqliteClient.query<SleepRow>('garmin', 'SELECT * FROM sleep WHERE day = ?', [day])
  return rows[0] ?? null
}

export async function getSleepRange(startDay: string, endDay: string): Promise<SleepRow[]> {
  return sqliteClient.query<SleepRow>(
    'garmin',
    'SELECT * FROM sleep WHERE day BETWEEN ? AND ? ORDER BY day ASC',
    [startDay, endDay],
  )
}

export async function getRestingHrRange(startDay: string, endDay: string): Promise<RestingHrRow[]> {
  return sqliteClient.query<RestingHrRow>(
    'garmin',
    'SELECT * FROM resting_hr WHERE day BETWEEN ? AND ? ORDER BY day ASC',
    [startDay, endDay],
  )
}

export async function getHrv(day: string): Promise<HrvRow | null> {
  const rows = await sqliteClient.query<HrvRow>('garmin', 'SELECT * FROM hrv WHERE day = ?', [day])
  return rows[0] ?? null
}

export async function getHrvRange(startDay: string, endDay: string): Promise<HrvRow[]> {
  return sqliteClient.query<HrvRow>('garmin', 'SELECT * FROM hrv WHERE day BETWEEN ? AND ? ORDER BY day ASC', [startDay, endDay])
}

export async function getStressForDay(day: string): Promise<StressRow[]> {
  return sqliteClient.query<StressRow>(
    'garmin',
    "SELECT * FROM stress WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC",
    [`${day} 00:00:00`, `${day} 23:59:59`],
  )
}

export async function getWeightRange(startDay: string, endDay: string): Promise<WeightRow[]> {
  return sqliteClient.query<WeightRow>(
    'garmin',
    'SELECT * FROM weight WHERE day BETWEEN ? AND ? ORDER BY day ASC',
    [startDay, endDay],
  )
}

export async function getMonitoringHrForDay(
  day: string,
): Promise<{ timestamp: string; heart_rate: number | null }[]> {
  return sqliteClient.query(
    'monitoring',
    'SELECT * FROM monitoring_hr WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC',
    [`${day} 00:00:00`, `${day} 23:59:59`],
  )
}

/** The first day with any all-day heart rate, i.e. how far back heart-rate history goes. */
export async function getFirstHeartRateDay(): Promise<string | null> {
  const rows = await sqliteClient.query<{ day: string | null }>('monitoring', 'SELECT substr(MIN(timestamp), 1, 10) as day FROM monitoring_hr WHERE heart_rate > 0')
  return rows[0]?.day ?? null
}

/** The single most recent all-day heart-rate sample GarminDB has recorded. */
export async function getLatestHeartRate(): Promise<{ timestamp: string; heart_rate: number } | null> {
  const rows = await sqliteClient.query<{ timestamp: string; heart_rate: number }>(
    'monitoring',
    'SELECT * FROM monitoring_hr ORDER BY timestamp DESC LIMIT 1',
  )
  return rows[0] ?? null
}

export async function getMonitoringPulseOxForDay(day: string): Promise<{ timestamp: string; pulse_ox: number | null }[]> {
  return sqliteClient.query(
    'monitoring',
    'SELECT * FROM monitoring_pulse_ox WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC',
    [`${day} 00:00:00`, `${day} 23:59:59`],
  )
}

export async function getMonitoringRrForDay(day: string): Promise<{ timestamp: string; rr: number | null }[]> {
  return sqliteClient.query(
    'monitoring',
    'SELECT * FROM monitoring_rr WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC',
    [`${day} 00:00:00`, `${day} 23:59:59`],
  )
}

export async function getSleepEventsForDay(nightStart: string): Promise<SleepEventRow[]> {
  // Sleep spans midnight, so widen the window a few hours either side of the given evening.
  return sqliteClient.query<SleepEventRow>(
    'garmin',
    'SELECT * FROM sleep_events WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC',
    [`${nightStart} 18:00:00`, `${addOneDay(nightStart)} 14:00:00`],
  )
}

function addOneDay(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Sum of activities.training_load per calendar day (sparse — only days with activities). */
export async function getDailyTrainingLoad(startDay: string, endDay: string): Promise<{ day: string; load: number }[]> {
  return sqliteClient.query(
    'activities',
    `SELECT strftime('%Y-%m-%d', start_time) as day, SUM(training_load) as load
     FROM activities WHERE start_time BETWEEN ? AND ? GROUP BY day ORDER BY day ASC`,
    [`${startDay} 00:00:00`, `${endDay} 23:59:59`],
  )
}

export async function getLatestActivityDay(): Promise<string | null> {
  const rows = await sqliteClient.query<{ day: string | null }>(
    'activities',
    "SELECT strftime('%Y-%m-%d', MAX(start_time)) as day FROM activities",
  )
  return rows[0]?.day ?? null
}

export async function getActivitiesRange(startDay: string, endDay: string): Promise<ActivityRow[]> {
  return sqliteClient.query<ActivityRow>(
    'activities',
    'SELECT * FROM activities WHERE start_time BETWEEN ? AND ? ORDER BY start_time DESC',
    [`${startDay} 00:00:00`, `${endDay} 23:59:59`],
  )
}

export async function getActivity(activityId: string): Promise<ActivityRow | null> {
  const rows = await sqliteClient.query<ActivityRow>('activities', 'SELECT * FROM activities WHERE activity_id = ?', [
    activityId,
  ])
  return rows[0] ?? null
}

export async function getActivityLaps(activityId: string): Promise<ActivityLapRow[]> {
  return sqliteClient.query<ActivityLapRow>(
    'activities',
    'SELECT * FROM activity_laps WHERE activity_id = ? ORDER BY lap ASC',
    [activityId],
  )
}

export async function getActivityRecords(activityId: string): Promise<ActivityRecordRow[]> {
  return sqliteClient.query<ActivityRecordRow>(
    'activities',
    'SELECT * FROM activity_records WHERE activity_id = ? ORDER BY record ASC',
    [activityId],
  )
}

export async function getStepsActivityVo2Max(activityId: string): Promise<number | null> {
  const rows = await sqliteClient.query<{ vo2_max: number | null }>(
    'activities',
    'SELECT vo2_max FROM steps_activities WHERE activity_id = ?',
    [activityId],
  )
  return rows[0]?.vo2_max ?? null
}

export interface Vo2MaxPoint {
  day: string
  vo2_max: number
  sport: string
}

export async function getVo2MaxHistory(startDay: string, endDay: string): Promise<Vo2MaxPoint[]> {
  const steps = await sqliteClient.query<Vo2MaxPoint>(
    'activities',
    `SELECT strftime('%Y-%m-%d', a.start_time) as day, s.vo2_max as vo2_max, a.sport as sport
     FROM steps_activities s JOIN activities a ON a.activity_id = s.activity_id
     WHERE s.vo2_max IS NOT NULL AND a.start_time BETWEEN ? AND ? ORDER BY a.start_time ASC`,
    [`${startDay} 00:00:00`, `${endDay} 23:59:59`],
  )
  const cycle = await sqliteClient.query<Vo2MaxPoint>(
    'activities',
    `SELECT strftime('%Y-%m-%d', a.start_time) as day, c.vo2_max as vo2_max, a.sport as sport
     FROM cycle_activities c JOIN activities a ON a.activity_id = c.activity_id
     WHERE c.vo2_max IS NOT NULL AND a.start_time BETWEEN ? AND ? ORDER BY a.start_time ASC`,
    [`${startDay} 00:00:00`, `${endDay} 23:59:59`],
  )
  return [...steps, ...cycle].sort((a, b) => a.day.localeCompare(b.day))
}
