import { describe, expect, it } from 'vitest'
import type { SetRecord, WorkoutWithSets } from '../../db/strengthLog'
import type { ActivityRow } from '../../db/types'
import { buildWorkoutSummary, letterFor } from './workoutSummary'

const set = (exercise: string, weight: number, reps: number, extra: Partial<SetRecord> = {}): SetRecord =>
  ({ id: `${exercise}-${weight}-${reps}-${Math.random()}`, workoutId: 'w', day: '2026-10-18', exercise, category: 'back', reps, weight, isWarmup: false, order: 0, createdAt: 0, ...extra }) as SetRecord

const workout = (sets: SetRecord[]): WorkoutWithSets =>
  ({ id: 'w', day: '2026-10-18', split: 'pull', notes: null, linkedActivityId: null, createdAt: 0, sets, startedAtEpochMs: 0, finishedAtEpochMs: 60 * 60_000 }) as unknown as WorkoutWithSets

describe('workout summary', () => {
  it('maps scores to letters at the band edges', () => {
    expect([95, 87, 81, 75, 69, 63, 56, 30].map(letterFor)).toEqual(['A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'D'])
  })

  it('totals working sets only, picks the best set per exercise and counts PRs', () => {
    const s = buildWorkoutSummary({
      workout: workout([set('Lat Pulldown', 50, 10), set('Lat Pulldown', 60, 8, { personalRecord: true }), set('Lat Pulldown', 20, 15, { isWarmup: true }), set('Row', 25, 12, { restSecondsBefore: 60 })]),
      activity: null,
      timeline: null,
      previousByExercise: new Map(),
    })
    expect(s.volumeKg).toBe(50 * 10 + 60 * 8 + 25 * 12)
    expect(s.workingSets).toBe(3)
    expect(s.reps).toBe(30)
    expect(s.prs).toBe(1)
    expect(s.topSets[0]).toEqual({ exercise: 'Lat Pulldown', weight: 60, reps: 8, pr: true })
    expect(s.durationMin).toBe(60)
  })

  it('compares with last time on the same exercises and grades only what has data', () => {
    const s = buildWorkoutSummary({
      workout: workout([set('Lat Pulldown', 60, 10), set('Curl', 10, 10)]),
      activity: { calories: 400, training_effect: 2.8, training_load: 80, anaerobic_training_effect: 1.5, avg_hr: 120, max_hr: 160 } as ActivityRow,
      timeline: null,
      previousByExercise: new Map([['Lat Pulldown', { sets: [set('Lat Pulldown', 50, 10)] }]]),
    })
    expect(s.vsLast.find((c) => c.label === 'Volume')?.change).toBe(20)
    expect(s.grades.map((g) => g.area)).toEqual(['strength', 'effort'])
    expect(s.calories).toBe(400)
    expect(s.recoveryHours).toBe(Math.round(12 + 2.8 * 9))
  })

  it('suggests adding weight only after the top of the rep range', () => {
    const heavy = buildWorkoutSummary({ workout: workout([set('Press', 40, 12)]), activity: null, timeline: null, previousByExercise: new Map() })
    expect(heavy.nextUp.some((n) => n.includes('41 kg'))).toBe(true)
    const light = buildWorkoutSummary({ workout: workout([set('Press', 40, 8)]), activity: null, timeline: null, previousByExercise: new Map() })
    expect(light.nextUp.some((n) => n.includes('aim for 9 reps'))).toBe(true)
  })
})
