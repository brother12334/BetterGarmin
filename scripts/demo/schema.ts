import type { Database } from 'better-sqlite3'

export function createGarminSchema(db: Database) {
  db.exec(`
    CREATE TABLE devices (
      serial_number INTEGER PRIMARY KEY,
      timestamp TEXT, device_type TEXT, manufacturer TEXT, product TEXT, hardware_version TEXT
    );
    CREATE TABLE weight (day TEXT PRIMARY KEY, weight REAL);
    CREATE TABLE stress (timestamp TEXT PRIMARY KEY, stress INTEGER);
    CREATE TABLE sleep (
      day TEXT PRIMARY KEY, start TEXT, end TEXT,
      total_sleep TEXT, deep_sleep TEXT, light_sleep TEXT, rem_sleep TEXT, awake TEXT,
      avg_spo2 REAL, avg_rr REAL, avg_stress REAL, score INTEGER, qualifier TEXT
    );
    CREATE TABLE sleep_events (timestamp TEXT PRIMARY KEY, event TEXT, duration TEXT);
    CREATE TABLE resting_hr (day TEXT PRIMARY KEY, resting_heart_rate REAL);
    CREATE TABLE hrv (
      day TEXT PRIMARY KEY, weekly_avg INTEGER, last_night_avg INTEGER, last_night_5min_high INTEGER,
      baseline_low INTEGER, baseline_upper INTEGER, status TEXT
    );
    CREATE TABLE daily_summary (
      day TEXT PRIMARY KEY,
      hr_min INTEGER, hr_max INTEGER, rhr INTEGER, stress_avg INTEGER,
      step_goal INTEGER, steps INTEGER,
      moderate_activity_time TEXT, vigorous_activity_time TEXT, intensity_time_goal TEXT,
      floors_up REAL, floors_down REAL, floors_goal REAL, distance REAL,
      calories_goal INTEGER, calories_total INTEGER, calories_bmr INTEGER, calories_active INTEGER, calories_consumed INTEGER,
      hydration_goal INTEGER, hydration_intake INTEGER, sweat_loss INTEGER,
      spo2_avg REAL, spo2_min REAL, rr_waking_avg REAL, rr_max REAL, rr_min REAL,
      bb_charged INTEGER, bb_max INTEGER, bb_min INTEGER, description TEXT
    );
  `)
}

export function createMonitoringSchema(db: Database) {
  db.exec(`
    CREATE TABLE monitoring_hr (timestamp TEXT PRIMARY KEY, heart_rate INTEGER);
    CREATE TABLE monitoring_intensity (timestamp TEXT PRIMARY KEY, moderate_activity_time TEXT, vigorous_activity_time TEXT);
    CREATE TABLE monitoring_climb (timestamp TEXT PRIMARY KEY, ascent REAL, descent REAL, cum_ascent REAL, cum_descent REAL);
    CREATE TABLE monitoring (
      timestamp TEXT, activity_type TEXT, intensity INTEGER, duration TEXT,
      distance REAL, active_calories INTEGER, steps INTEGER,
      PRIMARY KEY (timestamp, activity_type)
    );
    CREATE TABLE monitoring_rr (timestamp TEXT PRIMARY KEY, rr REAL);
    CREATE TABLE monitoring_pulse_ox (timestamp TEXT PRIMARY KEY, pulse_ox REAL);
    CREATE TABLE monitoring_hrv_value (timestamp TEXT PRIMARY KEY, hrv REAL);
    CREATE TABLE monitoring_hrv_status (
      timestamp TEXT PRIMARY KEY, weekly_average REAL, last_night REAL, last_night_average REAL,
      baseline_low REAL, baseline_high REAL, status INTEGER, reading_count INTEGER
    );
  `)
}

export function createActivitiesSchema(db: Database) {
  db.exec(`
    CREATE TABLE activities (
      activity_id TEXT PRIMARY KEY, name TEXT, description TEXT, type TEXT, sport TEXT, sub_sport TEXT,
      start_time TEXT, stop_time TEXT, elapsed_time TEXT, moving_time TEXT,
      distance REAL, calories INTEGER, avg_hr INTEGER, max_hr INTEGER, avg_rr REAL, max_rr REAL,
      avg_cadence INTEGER, max_cadence INTEGER, avg_speed REAL, max_speed REAL,
      ascent REAL, descent REAL, start_lat REAL, start_long REAL, stop_lat REAL, stop_long REAL,
      training_load REAL, training_effect REAL, anaerobic_training_effect REAL,
      self_eval_feel INTEGER, self_eval_effort INTEGER,
      laps INTEGER, course_id INTEGER, device_serial_number INTEGER
    );
    CREATE TABLE activity_laps (
      activity_id TEXT, lap INTEGER, start_time TEXT, stop_time TEXT, elapsed_time TEXT, moving_time TEXT,
      distance REAL, avg_hr INTEGER, max_hr INTEGER, avg_speed REAL, max_speed REAL,
      ascent REAL, descent REAL, calories INTEGER,
      PRIMARY KEY (activity_id, lap)
    );
    CREATE TABLE activity_records (
      activity_id TEXT, record INTEGER, timestamp TEXT,
      position_lat REAL, position_long REAL, distance REAL, cadence INTEGER,
      altitude REAL, hr INTEGER, speed REAL, temperature REAL,
      PRIMARY KEY (activity_id, record)
    );
    CREATE TABLE steps_activities (
      activity_id TEXT PRIMARY KEY, steps INTEGER, avg_pace TEXT, avg_moving_pace TEXT, max_pace TEXT,
      avg_steps_per_min INTEGER, max_steps_per_min INTEGER, vo2_max REAL
    );
    CREATE TABLE cycle_activities (activity_id TEXT PRIMARY KEY, strokes INTEGER, vo2_max REAL);
    CREATE TABLE paddle_activities (activity_id TEXT PRIMARY KEY, strokes INTEGER, avg_stroke_distance REAL);
    CREATE TABLE climbing_activities (activity_id TEXT PRIMARY KEY, total_routes INTEGER);
  `)
}

const SUMMARY_COLUMNS = `
  hr_avg REAL, hr_min REAL, hr_max REAL,
  rhr_avg REAL, inactive_hr_avg REAL,
  weight_avg REAL,
  steps INTEGER, steps_goal INTEGER,
  floors REAL, floors_goal REAL,
  sleep_avg TEXT, rem_sleep_avg TEXT,
  stress_avg INTEGER,
  calories_avg INTEGER, calories_bmr_avg INTEGER, calories_active_avg INTEGER, calories_goal INTEGER,
  activities INTEGER, activities_calories INTEGER, activities_distance REAL,
  spo2_avg REAL, spo2_min REAL,
  bb_max INTEGER, bb_min INTEGER
`

export function createSummarySchema(db: Database) {
  db.exec(`
    CREATE TABLE days_summary (day TEXT PRIMARY KEY, ${SUMMARY_COLUMNS});
    CREATE TABLE weeks_summary (first_day TEXT PRIMARY KEY, ${SUMMARY_COLUMNS});
    CREATE TABLE months_summary (first_day TEXT PRIMARY KEY, ${SUMMARY_COLUMNS});
    CREATE TABLE years_summary (first_day TEXT PRIMARY KEY, ${SUMMARY_COLUMNS});
  `)
}
