import { describe, expect, it } from 'vitest'
import { applyCorrections, findLikelyDuplicates } from './applyCorrections'
import type { CorrectionRecord, SetRecord, WorkoutRecord } from './strengthLog'

const workout: WorkoutRecord = { id: 'w', day: '2026-01-01', split: 'custom', notes: null, linkedActivityId: null, createdAt: 0 }
const set = (id: string, over: Partial<SetRecord> = {}): SetRecord => ({
  id,
  workoutId: 'w',
  day: '2026-01-01',
  exercise: 'Bench Press',
  category: 'chest',
  reps: 5,
  weight: 100,
  isWarmup: false,
  order: 0,
  createdAt: 0,
  ...over,
})
const corr = (c: Partial<CorrectionRecord> & { id: string }): CorrectionRecord => ({ workoutId: 'w', editedAt: 0, ...c })

describe('applyCorrections', () => {
  it('returns the import untouched when there are no corrections', () => {
    const sets = [set('a'), set('b')]
    const r = applyCorrections(workout, sets, [])
    expect(r.sets).toEqual(sets)
    expect(r.excluded).toEqual([])
  })

  it('applies field edits, marks them, and never mutates the stored set', () => {
    const original = set('a')
    const r = applyCorrections(workout, [original], [corr({ id: 'set:a', setId: 'a', fields: { exercise: 'Incline Bench', reps: 6 } })])
    expect(r.sets[0]).toMatchObject({ exercise: 'Incline Bench', reps: 6, weight: 100, editedFields: ['exercise', 'reps'] })
    expect(original.exercise).toBe('Bench Press')
  })

  it('applies a workout-level unit fix, but an explicit weight edit wins', () => {
    const r = applyCorrections(
      workout,
      [set('a', { weight: 220 }), set('b', { weight: 220 })],
      [corr({ id: 'workout:w', weightScale: 0.45359237 }), corr({ id: 'set:b', setId: 'b', fields: { weight: 90 } })],
    )
    expect(r.sets[0].weight).toBe(99.79)
    expect(r.sets[1].weight).toBe(90)
    expect(r.settings.weightScale).toBeCloseTo(0.4536)
  })

  it('moves excluded sets out of the analysed list', () => {
    const r = applyCorrections(workout, [set('a'), set('b')], [corr({ id: 'set:b', setId: 'b', fields: { excluded: true } })])
    expect(r.sets.map((s) => s.id)).toEqual(['a'])
    expect(r.excluded.map((s) => s.id)).toEqual(['b'])
  })

  it('timing-only corrections leave fields alone and report the clock offset', () => {
    const r = applyCorrections(workout, [set('a')], [corr({ id: 'set:a', setId: 'a', startMs: 5 }), corr({ id: 'workout:w', clockOffsetMs: 3_600_000 })])
    expect(r.sets[0].editedFields).toBeUndefined()
    expect(r.settings.clockOffsetMs).toBe(3_600_000)
  })

  it('un-marking a warm-up turns it into a working set', () => {
    const r = applyCorrections(workout, [set('a', { isWarmup: true, setType: 'warmup' })], [corr({ id: 'set:a', setId: 'a', fields: { isWarmup: false } })])
    expect(r.sets[0]).toMatchObject({ isWarmup: false, setType: 'working' })
  })
})

describe('findLikelyDuplicates', () => {
  it('flags the later copy of an identical set logged within 10 s', () => {
    const d = findLikelyDuplicates([set('a', { atEpochMs: 1000 }), set('b', { atEpochMs: 6000 }), set('c', { atEpochMs: 60000 })])
    expect([...d]).toEqual(['b'])
  })

  it('does not flag different loads, reps or exercises', () => {
    const d = findLikelyDuplicates([set('a', { atEpochMs: 1000 }), set('b', { atEpochMs: 3000, reps: 6 }), set('c', { atEpochMs: 4000, weight: 90 }), set('d', { atEpochMs: 5000, exercise: 'Row' })])
    expect(d.size).toBe(0)
  })
})
