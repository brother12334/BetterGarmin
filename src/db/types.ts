/** The distinct GarminDB SQLite files, identified by table signature rather than filename. */
export type DbKind = 'garmin' | 'monitoring' | 'activities' | 'summary'

export interface DbKindInfo {
  kind: DbKind
  /** Friendly label for UI, e.g. in the file-loading screen. */
  label: string
}

export const DB_KIND_INFO: Record<DbKind, DbKindInfo> = {
  garmin: { kind: 'garmin', label: 'garmin.db (sleep, weight, HRV, daily summary)' },
  monitoring: { kind: 'monitoring', label: 'garmin_monitoring.db (all-day HR, steps, SpO2)' },
  activities: { kind: 'activities', label: 'garmin_activities.db (workouts & routes)' },
  summary: { kind: 'summary', label: 'garmin_summary.db / summary.db (rollups)' },
}

// --- garmin.db rows -------------------------------------------------------

export interface DailySummaryRow {
  day: string // ISO date, e.g. '2026-03-01'
  hr_min: number | null
  hr_max: number | null
  rhr: number | null
  stress_avg: number | null
  steps: number | null
  step_goal: number | null
  floors_up: number | null
  floors_goal: number | null
  distance: number | null
  calories_total: number | null
  calories_bmr: number | null
  calories_active: number | null
  calories_goal: number | null
  bb_charged: number | null
  bb_max: number | null
  bb_min: number | null
  spo2_avg: number | null
  spo2_min: number | null
  rr_waking_avg: number | null
  moderate_activity_time: string | null // HH:MM:SS duration
  vigorous_activity_time: string | null
  intensity_time_goal: string | null
  description: string | null
}

export interface SleepRow {
  day: string
  start: string | null
  end: string | null
  total_sleep: string | null // HH:MM:SS
  deep_sleep: string | null
  light_sleep: string | null
  rem_sleep: string | null
  awake: string | null
  avg_spo2: number | null
  avg_rr: number | null
  avg_stress: number | null
  score: number | null
  qualifier: string | null
}

export interface SleepEventRow {
  timestamp: string
  event: 'deep_sleep' | 'light_sleep' | 'rem_sleep' | 'awake' | 'wake_time'
  duration: string
}

export interface RestingHrRow {
  day: string
  resting_heart_rate: number | null
}

export interface HrvRow {
  day: string
  weekly_avg: number | null
  last_night_avg: number | null
  last_night_5min_high: number | null
  baseline_low: number | null
  baseline_upper: number | null
  status: string | null
}

export interface StressRow {
  timestamp: string
  stress: number | null
}

export interface WeightRow {
  day: string
  weight: number | null
}

// --- garmin_monitoring.db rows --------------------------------------------

export interface MonitoringHrRow {
  timestamp: string
  heart_rate: number | null
}

export interface MonitoringRow {
  timestamp: string
  activity_type: string | null
  steps: number | null
  distance: number | null
  active_calories: number | null
  intensity: number | null
}

export interface MonitoringIntensityRow {
  timestamp: string
  moderate_activity_time: string | null
  vigorous_activity_time: string | null
}

export interface MonitoringClimbRow {
  timestamp: string
  ascent: number | null
  descent: number | null
  cum_ascent: number | null
  cum_descent: number | null
}

export interface MonitoringPulseOxRow {
  timestamp: string
  pulse_ox: number | null
}

export interface MonitoringRrRow {
  timestamp: string
  rr: number | null
}

export interface MonitoringHrvValueRow {
  timestamp: string
  hrv: number | null
}

export interface MonitoringHrvStatusRow {
  timestamp: string
  weekly_average: number | null
  last_night: number | null
  last_night_average: number | null
  baseline_low: number | null
  baseline_high: number | null
  status: number | null
  reading_count: number | null
}

// --- garmin_activities.db rows --------------------------------------------

export interface ActivityRow {
  activity_id: string
  name: string | null
  description: string | null
  type: string | null
  sport: string | null
  sub_sport: string | null
  start_time: string | null
  stop_time: string | null
  elapsed_time: string | null
  moving_time: string | null
  distance: number | null
  calories: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_rr: number | null
  max_rr: number | null
  avg_cadence: number | null
  max_cadence: number | null
  avg_speed: number | null
  max_speed: number | null
  ascent: number | null
  descent: number | null
  start_lat: number | null
  start_long: number | null
  stop_lat: number | null
  stop_long: number | null
  training_load: number | null
  training_effect: number | null
  anaerobic_training_effect: number | null
  /** Garmin's own post-workout self-rating, 1-5. Only present for some activities (notably strength training, where set/rep/weight detail isn't stored at all). */
  self_eval_feel: number | null
  self_eval_effort: number | null
}

export interface ActivityRecordRow {
  activity_id: string
  record: number
  timestamp: string | null
  position_lat: number | null
  position_long: number | null
  distance: number | null
  cadence: number | null
  altitude: number | null
  hr: number | null
  speed: number | null
  temperature: number | null
}

export interface ActivityLapRow {
  activity_id: string
  lap: number
  start_time: string | null
  stop_time: string | null
  elapsed_time: string | null
  moving_time: string | null
  distance: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_speed: number | null
  max_speed: number | null
  ascent: number | null
  descent: number | null
  calories: number | null
}

export interface StepsActivityRow {
  activity_id: string
  steps: number | null
  avg_pace: string | null
  avg_steps_per_min: number | null
  vo2_max: number | null
}

export interface CycleActivityRow {
  activity_id: string
  vo2_max: number | null
}

// --- garmin_summary.db / summary.db rows -----------------------------------

export interface SummaryRow {
  /** 'day' on days_summary, 'first_day' on weeks/months/years_summary. */
  period_start: string
  hr_avg: number | null
  hr_min: number | null
  hr_max: number | null
  rhr_avg: number | null
  inactive_hr_avg: number | null
  weight_avg: number | null
  steps: number | null
  steps_goal: number | null
  floors: number | null
  sleep_avg: string | null
  stress_avg: number | null
  calories_avg: number | null
  activities: number | null
  activities_distance: number | null
  bb_max: number | null
  bb_min: number | null
  spo2_avg: number | null
}

export type SummaryPeriod = 'day' | 'week' | 'month' | 'year'
