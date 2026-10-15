import { describe, expect, it } from 'vitest'
import type { SetRecord, WorkoutWithSets } from '../../db/strengthLog'
import { addDays, enumerateDays } from '../../lib/dateRange'
import { buildSessions, indexExercises, type AnalyticsDataset, type DayRecord } from './model'
import { computeRecovery } from './recovery'
import { progressionFindings, restRepsFinding, sleepPerformanceFinding, volumeRhrFinding } from './findings'
import { classifyDeviations, cliffsDelta, evidenceFor, mad, median, robustBaseline, spearman, splitAtMedian } from './robust'

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function workout(id: string, day: string, sets: { ex: string; w: number; r: number; rest?: number }[]): WorkoutWithSets {
  return {
    id,
    day,
    split: 'custom',
    notes: null,
    linkedActivityId: null,
    createdAt: 0,
    sets: sets.map(
      (s, i): SetRecord => ({ id: `${id}-${i}`, workoutId: id, day, exercise: s.ex, category: 'chest', reps: s.r, weight: s.w, isWarmup: false, order: i, createdAt: 0, restSecondsBefore: s.rest ?? null }),
    ),
  }
}

function dataset(workouts: WorkoutWithSets[], days: DayRecord[], firstDay: string, lastDay: string): AnalyticsDataset {
  const sessions = buildSessions(workouts, new Map())
  return { firstDay, lastDay, days, dayIndex: new Map(days.map((d) => [d.day, d])), sessions, exerciseHistory: indexExercises(sessions), aligned: new Map(), workouts }
}

const blankDay = (day: string): DayRecord => ({ day, restingHr: null, hrv: null, sleepMinutes: null, sleepScore: null, bedtime: null, steps: null, stressAvg: null })

describe('robust statistics', () => {
  it('median and MAD resist a single outlier', () => {
    expect(median([1, 2, 3, 4, 100])).toBe(3)
    expect(mad([10, 10, 11, 9, 10, 200])).toBeCloseTo(0.741, 2)
  })

  it('refuses a baseline below the minimum sample size', () => {
    expect(robustBaseline([50, 51, 52])).toBeNull()
    expect(robustBaseline(Array(14).fill(50))).not.toBeNull()
  })

  it('Cliff delta: identical groups → 0, separated → ±1', () => {
    expect(cliffsDelta([1, 2, 3], [1, 2, 3])).toBe(0)
    expect(cliffsDelta([5, 6], [1, 2])).toBe(1)
    expect(cliffsDelta([1, 2], [5, 6])).toBe(-1)
  })

  it('evidence is "insufficient" for tiny groups regardless of effect size', () => {
    expect(evidenceFor(3, 1)).toBe('insufficient')
    expect(evidenceFor(25, 0.6)).toBe('strong')
    expect(evidenceFor(25, 0.05)).toBe('weak')
  })

  it('Spearman handles ties and monotone relationships', () => {
    const pairs: [number, number][] = [1, 2, 3, 4, 5, 6, 7, 8].map((x) => [x, x * x])
    expect(spearman(pairs)!.rho).toBeCloseTo(1)
    expect(spearman(pairs.slice(0, 4))).toBeNull()
  })

  it('median split never leaves a group empty because of ties', () => {
    const vals = [360, 360, 360, 480, 480]
    const s = splitAtMedian(vals, (v) => v)!
    expect(s.high.length).toBeGreaterThan(0)
    expect(s.low.length).toBeGreaterThan(0)
    expect(s.high.length + s.low.length).toBe(5)
  })

  it('separates a one-off deviation from a sustained one', () => {
    const r = rng(1)
    const base = Array.from({ length: 30 }, (_, i) => ({ day: `d${i}`, v: 55 + (r() - 0.5) * 2 }))
    const oneOff = classifyDeviations([...base, { day: 'x', v: 65 }])
    expect(oneOff[oneOff.length - 1].status).toBe('deviation')
    const run = classifyDeviations([...base, { day: 'a', v: 65 }, { day: 'b', v: 66 }, { day: 'c', v: 64 }], 28, 1)
    expect(run[run.length - 1].status).toBe('sustained')
  })
})

describe('findings', () => {
  const first = '2026-01-01'

  it('detects genuine progression and reports stability when there is none', () => {
    const rising = Array.from({ length: 12 }, (_, i) => workout(`w${i}`, addDays(first, i * 4), [{ ex: 'Bench', w: 80 + (i >= 9 ? 10 : 0), r: 5 }, { ex: 'Bench', w: 80 + (i >= 9 ? 10 : 0), r: 5 }]))
    const flat = Array.from({ length: 12 }, (_, i) => workout(`f${i}`, addDays(first, i * 4), [{ ex: 'Row', w: 60, r: 8 }]))
    const last = addDays(first, 48)
    const ds = dataset([...rising, ...flat], [], first, last)
    const fs = progressionFindings(ds, null)
    const bench = fs.find((f) => f.id === 'progression:Bench')!
    const row = fs.find((f) => f.id === 'progression:Row')!
    expect(bench.title).toMatch(/up/)
    expect(bench.effect).toBe(1)
    expect(row.title).toMatch(/held steady/)
    expect(bench.score).toBeGreaterThan(row.score)
  })

  it('marks progression insufficient with fewer than 6 sessions', () => {
    const ws = Array.from({ length: 4 }, (_, i) => workout(`w${i}`, addDays(first, i * 3), [{ ex: 'Squat', w: 100, r: 5 }]))
    const f = progressionFindings(dataset(ws, [], first, addDays(first, 12)), null)[0]
    expect(f.evidence).toBe('insufficient')
    expect(f.needs).toMatch(/2 more/)
  })

  it('finds a planted sleep → performance relationship, and not one in noise', () => {
    const days = enumerateDays(first, addDays(first, 120)).map(blankDay)
    const r = rng(7)
    const make = (planted: boolean) => {
      const ws: WorkoutWithSets[] = []
      for (let i = 0; i < 40; i++) {
        const day = addDays(first, i * 3)
        const longSleep = r() > 0.5
        days.find((d) => d.day === day)!.sleepMinutes = longSleep ? 480 : 360
        const w = 100 + (planted && longSleep ? 6 : 0) + (r() - 0.5) * 2
        ws.push(workout(`s${i}`, day, [{ ex: 'Squat', w, r: 5 }]))
      }
      return sleepPerformanceFinding(dataset(ws, days, first, addDays(first, 120)))
    }
    const planted = make(true)
    expect(planted.effect!).toBeGreaterThan(0.33)
    expect(planted.title).toMatch(/stronger/)
    expect(['moderate', 'strong']).toContain(planted.evidence)
    expect(planted.alternatives.join(' ')).toMatch(/not evidence that sleep caused/)

    const noise = make(false)
    expect(Math.abs(noise.effect!)).toBeLessThan(0.33)
  })

  it('rest → reps uses only consecutive same-load sets of the same exercise', () => {
    const ws = Array.from({ length: 6 }, (_, i) =>
      workout(`r${i}`, addDays(first, i), [
        { ex: 'Bench', w: 80, r: 8 },
        { ex: 'Bench', w: 80, r: 8, rest: 180 },
        { ex: 'Bench', w: 80, r: 6, rest: 60 },
        { ex: 'Bench', w: 90, r: 3, rest: 60 }, // load changed → excluded
        { ex: 'Row', w: 60, r: 10, rest: 60 }, // exercise changed → excluded
      ]),
    )
    const f = restRepsFinding(dataset(ws, [], first, addDays(first, 6)))
    expect(f.n).toBe(12)
    expect(f.effect).toBe(1)
    expect(f.title).toMatch(/fewer reps lost/)
  })

  it('volume ↔ RHR needs 8 weeks before saying anything', () => {
    const days = enumerateDays(first, addDays(first, 30)).map((d) => ({ ...blankDay(d), restingHr: 55 }))
    const f = volumeRhrFinding(dataset([workout('a', first, [{ ex: 'Squat', w: 100, r: 5 }])], days, first, addDays(first, 30)))
    expect(f.evidence).toBe('insufficient')
  })
})

describe('recovery indicators', () => {
  const first = '2026-01-01'
  const last = addDays(first, 59)

  it('reports nothing when history is too short, and lists what is missing', () => {
    const days = enumerateDays(addDays(last, -5), last).map((d) => ({ ...blankDay(d), restingHr: 55 }))
    const r = computeRecovery(dataset([], days, first, last))
    expect(r.available).toBe(0)
    expect(r.statement).toMatch(/Not enough history/)
    expect(r.missing).toContain('Resting heart rate')
  })

  it('counts indicators in the less-recovered direction without combining them into a score', () => {
    const rnd = rng(3)
    const days = enumerateDays(first, last).map((d, i) => ({
      ...blankDay(d),
      restingHr: i >= 53 ? 62 : 54 + Math.round((rnd() - 0.5) * 2),
      hrv: i >= 53 ? 38 : 50 + Math.round((rnd() - 0.5) * 4),
      sleepMinutes: 450 + Math.round((rnd() - 0.5) * 30),
    }))
    const r = computeRecovery(dataset([], days, first, last))
    const rhr = r.indicators.find((i) => i.key === 'restingHr')!
    const hrv = r.indicators.find((i) => i.key === 'hrv')!
    const sleep = r.indicators.find((i) => i.key === 'sleepMinutes')!
    expect(rhr.direction).toBe('above')
    expect(rhr.lessRecoveredDirection).toBe(true)
    expect(rhr.status).toBe('sustained')
    expect(hrv.lessRecoveredDirection).toBe(true)
    expect(sleep.status).toBe('typical')
    expect(r.differingLessRecovered).toBe(2)
    expect(r.statement).toMatch(/not a diagnosis/)
  })
})
