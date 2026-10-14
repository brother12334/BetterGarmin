import type { DbKind } from './types'

/**
 * GarminDB splits data across several SQLite files. Users may rename files or
 * drop in only some of them, so we identify each file by the tables it
 * actually contains rather than trusting its filename.
 */
const SIGNATURES: { kind: DbKind; requiredAny: string[] }[] = [
  { kind: 'garmin', requiredAny: ['daily_summary', 'sleep', 'hrv'] },
  { kind: 'monitoring', requiredAny: ['monitoring_hr', 'monitoring_pulse_ox', 'monitoring_hrv_value'] },
  { kind: 'activities', requiredAny: ['activities', 'activity_records', 'steps_activities'] },
  { kind: 'summary', requiredAny: ['days_summary', 'weeks_summary', 'months_summary', 'years_summary'] },
]

export function identifyDbKind(tableNames: string[]): DbKind | null {
  const tableSet = new Set(tableNames)
  for (const sig of SIGNATURES) {
    if (sig.requiredAny.some((t) => tableSet.has(t))) return sig.kind
  }
  return null
}
