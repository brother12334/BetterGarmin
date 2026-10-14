import { sqliteClient } from './client'
import type { DailySummaryRow, HrvRow, RestingHrRow, SleepRow, StressRow, WeightRow } from './types'

/**
 * GarminDB data is static until the user re-syncs, so "today" means the most
 * recent day present in the database rather than the calendar date.
 */
export async function getLatestDay(): Promise<string | null> {
  const rows = await sqliteClient.query<{ day: string | null }>(
    'garmin',
    'SELECT MAX(day) as day FROM daily_summary',
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
