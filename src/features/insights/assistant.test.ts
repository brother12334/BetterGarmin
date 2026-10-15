import { describe, expect, it } from 'vitest'
import { buildContext, parseAnswer } from './assistant'
import type { AnalyticsResult } from '../analytics/useAnalytics'
import { buildSessions, indexExercises } from '../analytics/model'
import { buildWorkoutTimeline } from '../training/workoutTimeline'
import type { WorkoutWithSets } from '../../db/strengthLog'

describe('assistant', () => {
  it('keeps citations of real findings and drops invented ones', () => {
    const parts = parseAnswer('Bench is up [F:progression:Bench]. Also [F:made-up] here.', new Set(['progression:Bench']))
    expect(parts).toEqual([
      { kind: 'text', text: 'Bench is up ' },
      { kind: 'cite', id: 'progression:Bench' },
      { kind: 'text', text: '. Also ' },
      { kind: 'text', text: ' here.' },
    ])
  })

  it('sends computed summaries only — no raw heart-rate samples', () => {
    const start = Date.UTC(2026, 0, 1, 10)
    const w: WorkoutWithSets = {
      id: 'w1',
      day: '2026-01-01',
      split: 'custom',
      notes: null,
      linkedActivityId: null,
      createdAt: 0,
      startedAtEpochMs: start,
      finishedAtEpochMs: start + 600_000,
      sets: [{ id: 's1', workoutId: 'w1', day: '2026-01-01', exercise: 'Bench', category: 'chest', reps: 5, weight: 100, isWarmup: false, order: 0, createdAt: 0, atEpochMs: start + 100_000, restSecondsBefore: 60 }],
    }
    const hrSamples = Array.from({ length: 600 }, (_, i) => ({ t: start + i * 1000, v: 123 }))
    const timeline = buildWorkoutTimeline({ startedAtEpochMs: start, finishedAtEpochMs: start + 600_000, sets: w.sets, hrSamples })
    const sessions = buildSessions([w], new Map())
    const result: AnalyticsResult = {
      dataset: {
        firstDay: '2025-01-01',
        lastDay: '2026-01-01',
        days: [],
        dayIndex: new Map(),
        sessions,
        exerciseHistory: indexExercises(sessions),
        aligned: new Map([['w1', { matchedActivity: null, hrSource: 'activity', timeline, corrections: [], clockOffsetMs: 0 }]]),
        workouts: [w],
      },
      recovery: { asOf: '2026-01-01', indicators: [], available: 0, differingLessRecovered: 0, sustainedLessRecovered: 0, missing: [], statement: 'x' },
      findings: [],
    }
    const json = JSON.stringify(buildContext(result))
    expect(json).not.toMatch(/hrSeries|"t":/)
    expect(json.length).toBeLessThan(3000)
    expect(json).toContain('"sessionsWithHrTimeline":1')
  })
})
