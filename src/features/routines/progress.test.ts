import { describe, expect, it } from 'vitest'
import { exerciseProgress, weeklyStats } from './progress'
import { previousSets } from './routines'
import type { WorkoutWithSets } from '../../db/strengthLog'

const w = (day: string, sets: [string, number, number | null, boolean?][]): WorkoutWithSets =>
  ({
    id: day,
    day,
    split: 'custom',
    notes: null,
    linkedActivityId: null,
    createdAt: Date.parse(day),
    sets: sets.map(([exercise, reps, weight, isWarmup], i) => ({ id: `${day}-${i}`, workoutId: day, day, exercise, category: 'chest', reps, weight, isWarmup: !!isWarmup, order: i, createdAt: 0 })),
  }) as unknown as WorkoutWithSets

describe('progress', () => {
  const log = [w('2026-10-01', [['Bench', 8, 60], ['Bench', 5, 40, true]]), w('2026-10-08', [['Bench', 8, 62.5]]), w('2026-10-15', [['Bench', 8, 60], ['Pull-up', 10, null]])]

  it('flags a record only when the latest session beats every earlier one, and ignores warm-ups and unweighted sets', () => {
    const p = exerciseProgress(log)
    const bench = p.find((x) => x.exercise === 'Bench')!
    expect(bench.isRecord).toBe(false)
    expect(bench.best.weight).toBe(62.5)
    expect(bench.previous?.weight).toBe(62.5)
    expect(p.find((x) => x.exercise === 'Pull-up')).toBeUndefined()
    const p2 = exerciseProgress([...log, w('2026-10-22', [['Bench', 6, 70]])])
    expect(p2.find((x) => x.exercise === 'Bench')!.isRecord).toBe(true)
  })

  it('previous numbers come from the newest earlier workout with that exercise', () => {
    expect(previousSets(log, 'bench')).toEqual({ day: '2026-10-15', sets: [{ reps: 8, weight: 60 }] })
    expect(previousSets(log, 'Bench', '2026-10-15')?.day).toBe('2026-10-08')
    expect(previousSets(log, 'Squat')).toBeNull()
  })

  it('weekly stats count workouts and only known durations', () => {
    const now = Date.parse('2026-10-19T12:00:00')
    const s = weeklyStats(
      [
        { at: Date.parse('2026-10-19T08:00:00'), duration: 3600 },
        { at: Date.parse('2026-10-20T08:00:00'), duration: null },
        { at: Date.parse('2026-10-14T08:00:00'), duration: 1800 },
      ],
      2,
      now,
    )
    expect(s.map((x) => [x.workouts, x.seconds, x.unknownDuration])).toEqual([
      [1, 1800, 0],
      [2, 3600, 1],
    ])
  })
})
