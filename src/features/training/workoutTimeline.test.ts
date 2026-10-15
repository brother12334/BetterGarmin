import { describe, expect, it } from 'vitest'
import type { SetRecord } from '../../db/strengthLog'
import { buildWorkoutTimeline, cleanSamples, coverageOf, detectGaps, latestSample, sampleNear, type HrSample } from './workoutTimeline'

const T0 = Date.UTC(2026, 9, 8, 17, 50, 0)
const s = (sec: number) => T0 + sec * 1000

function set(id: string, exercise: string, atSec: number | null, restSecondsBefore: number | null, order: number): SetRecord {
  return {
    id,
    workoutId: 'w',
    day: '2026-10-08',
    exercise,
    category: 'chest',
    reps: 5,
    weight: 100,
    isWarmup: false,
    order,
    createdAt: 0,
    atEpochMs: atSec == null ? null : s(atSec),
    restSecondsBefore,
  }
}

/** 1 Hz HR: 90 at rest, 150 during [from, to) windows. */
function hrStream(fromSec: number, toSec: number, effort: [number, number][], stepSec = 1): HrSample[] {
  const out: HrSample[] = []
  for (let t = fromSec; t <= toSec; t += stepSec) {
    const hard = effort.some(([a, b]) => t >= a && t < b)
    out.push({ t: s(t), v: hard ? 150 : 90 })
  }
  return out
}

describe('cleanSamples', () => {
  it('drops implausible values and de-duplicates identical timestamps', () => {
    const { series, dropped, duplicates } = cleanSamples([
      { t: 3, v: 100 },
      { t: 1, v: 0 },
      { t: 2, v: 300 },
      { t: 3, v: 120 },
      { t: 4, v: 101 },
    ])
    expect(series).toEqual([
      { t: 3, v: 100 },
      { t: 4, v: 101 },
    ])
    expect(dropped).toBe(2)
    expect(duplicates).toBe(1)
  })
})

describe('sampleNear', () => {
  it('returns the nearest sample within tolerance and never interpolates', () => {
    const series = [
      { t: 0, v: 100 },
      { t: 20_000, v: 140 },
    ]
    expect(sampleNear(series, 3_000)).toBe(100)
    expect(sampleNear(series, 10_000)).toBeNull()
  })
})

describe('latestSample', () => {
  it('returns the last real reading and its age, but nothing across a gap', () => {
    const series = [
      { t: 0, v: 100 },
      { t: 10_000, v: 120 },
    ]
    expect(latestSample(series, 14_000)).toEqual({ v: 120, ageMs: 4_000 })
    expect(latestSample(series, 10_000 + 61_000)).toBeNull()
    expect(latestSample(series, -1)).toBeNull()
  })
})

describe('coverage and gaps', () => {
  it('reports full coverage for dense data and partial for a gap', () => {
    const dense = hrStream(0, 600, [])
    expect(coverageOf(dense, s(0), s(600))).toBeGreaterThan(0.99)

    const withGap = dense.filter((p) => p.t < s(200) || p.t > s(400))
    const cov = coverageOf(withGap, s(0), s(600))
    expect(cov).toBeGreaterThan(0.6)
    expect(cov).toBeLessThan(0.75)
    expect(detectGaps(withGap, s(0), s(600))).toEqual([{ startMs: s(199), endMs: s(401) }])
  })

  it('treats a window with no samples as one gap', () => {
    expect(detectGaps([], s(0), s(10))).toEqual([{ startMs: s(0), endMs: s(10) }])
  })
})

describe('buildWorkoutTimeline', () => {
  const sets = [set('a', 'Bench', 100, 60, 0), set('b', 'Bench', 220, 90, 1), set('c', 'Row', 400, 120, 2)]
  // Real effort windows that match the estimated boundaries: start = prevEnd + rest.
  const hr = hrStream(0, 600, [
    [60, 100],
    [190, 220],
    [340, 400],
  ])

  it('estimates starts from reported rest and labels the provenance', () => {
    const tl = buildWorkoutTimeline({ startedAtEpochMs: s(0), finishedAtEpochMs: s(600), sets, hrSamples: hr })!
    expect(tl.sets.map((x) => [x.startMs, x.endMs])).toEqual([
      [s(60), s(100)],
      [s(190), s(220)],
      [s(340), s(400)],
    ])
    expect(tl.sets.every((x) => x.startSource === 'estimated-from-rest' && x.endSource === 'logged')).toBe(true)
    expect(tl.sets[0].stats.avg).toBe(150)
    expect(tl.sets[0].preSetHr).toBe(90)
    expect(tl.sets[0].confidence).toBe('medium')
    expect(tl.segments.map((x) => x.type)).toEqual(['warmup', 'set', 'rest', 'set', 'transition', 'set', 'cooldown'])
    expect(tl.quality.estimatedStarts).toBe(3)
  })

  it('measures rest recovery at fixed checkpoints and time-to-return', () => {
    const tl = buildWorkoutTimeline({ startedAtEpochMs: s(0), finishedAtEpochMs: s(600), sets, hrSamples: hr })!
    const rest = tl.sets[0].restAfter!
    expect(rest.durationMs).toBe(90_000)
    expect(rest.hrAtStart).toBe(90) // effort ends at 100s; sample at 100s is already back to 90 in this synthetic stream
    expect(rest.checkpoints).toEqual([
      { seconds: 30, hr: 90 },
      { seconds: 60, hr: 90 },
    ])
    expect(rest.returnTarget).toBe(100)
    expect(rest.secondsToReturn).toBe(0)
  })

  it('uses corrected boundaries and marks them high-confidence', () => {
    const tl = buildWorkoutTimeline({
      startedAtEpochMs: s(0),
      finishedAtEpochMs: s(600),
      sets,
      hrSamples: hr,
      corrections: [{ setId: 'a', startMs: s(55), endMs: s(98) }],
    })!
    expect(tl.sets[0].startMs).toBe(s(55))
    expect(tl.sets[0].endMs).toBe(s(98))
    expect(tl.sets[0].startSource).toBe('corrected')
    expect(tl.sets[0].confidence).toBe('high')
    expect(tl.quality.correctedBoundaries).toBe(2)
    // The next set's estimate now chains from the corrected end.
    expect(tl.sets[1].startMs).toBe(s(98 + 90))
  })

  it('flags a corrected start that overlaps the previous set instead of silently moving it', () => {
    const tl = buildWorkoutTimeline({
      startedAtEpochMs: s(0),
      finishedAtEpochMs: s(600),
      sets,
      hrSamples: hr,
      corrections: [{ setId: 'b', startMs: s(80) }],
    })!
    expect(tl.sets[1].startMs).toBe(s(80))
    expect(tl.quality.overlaps).toBe(1)
    expect(tl.sets[1].issues.join(' ')).toMatch(/overlaps/)
  })

  it('applies a clock offset to every workout-side timestamp (e.g. phone vs watch, or a wrong time zone)', () => {
    const oneHour = 3_600_000
    // HR recorded an hour "later" in absolute time than the logger thinks — a classic time-zone mismatch.
    const shifted = hr.map((p) => ({ t: p.t + oneHour, v: p.v }))
    const wrong = buildWorkoutTimeline({ startedAtEpochMs: s(0), finishedAtEpochMs: s(600), sets, hrSamples: shifted })!
    expect(wrong.quality.sampleCount).toBe(0)
    expect(wrong.sets[0].confidence).toBe('none')

    const fixed = buildWorkoutTimeline({ startedAtEpochMs: s(0), finishedAtEpochMs: s(600), sets, hrSamples: shifted, clockOffsetMs: oneHour })!
    expect(fixed.sets[0].stats.avg).toBe(150)
    expect(fixed.quality.clockOffsetMs).toBe(oneHour)
  })

  it('reports missing HR during a set as low coverage rather than filling it', () => {
    const holey = hr.filter((p) => p.t < s(185) || p.t > s(260))
    const tl = buildWorkoutTimeline({ startedAtEpochMs: s(0), finishedAtEpochMs: s(600), sets, hrSamples: holey })!
    expect(tl.sets[1].stats.n).toBe(0)
    expect(tl.sets[1].confidence).toBe('none')
    expect(tl.gapRanges.length).toBe(1)
  })

  it('clamps sets logged outside the window and leaves untimed sets off the timeline', () => {
    const tl = buildWorkoutTimeline({
      startedAtEpochMs: s(0),
      finishedAtEpochMs: s(600),
      sets: [...sets, set('d', 'Row', 700, 30, 3), set('e', 'Row', null, null, 4)],
      hrSamples: hr,
    })!
    const last = tl.sets[tl.sets.length - 1]
    expect(last.endMs).toBe(s(600))
    expect(last.endSource).toBe('clamped')
    expect(tl.quality.untimedSets).toBe(1)
  })

  it('handles a rest/timestamp contradiction without producing a negative-length set', () => {
    const tl = buildWorkoutTimeline({
      startedAtEpochMs: s(0),
      finishedAtEpochMs: s(600),
      sets: [set('a', 'Bench', 100, 300, 0)],
      hrSamples: hr,
    })!
    expect(tl.sets[0].durationMs).toBeGreaterThan(0)
    expect(tl.sets[0].startSource).toBe('clamped')
    expect(tl.sets[0].issues.length).toBe(1)
  })

  it('flags an implausibly long estimated set instead of presenting it as normal', () => {
    // Logged 300s after the previous set, but only 60s rest reported → a 240s "set".
    const tl = buildWorkoutTimeline({
      startedAtEpochMs: s(0),
      finishedAtEpochMs: s(600),
      sets: [set('a', 'Bench', 100, 60, 0), set('b', 'Bench', 400, 60, 1)],
      hrSamples: hr,
    })!
    expect(tl.sets[1].durationMs).toBe(240_000)
    expect(tl.sets[1].confidence).toBe('low')
    expect(tl.sets[1].issues.join(' ')).toMatch(/probably shorter/)
    expect(tl.quality.issues.join(' ')).toMatch(/implausibly long/)
  })

  it('groups consecutive superset sets and treats moves between partners as rest', () => {
    const ss = (id: string, ex: string, at: number, order: number) => ({ ...set(id, ex, at, 20, order), setType: 'superset' as const })
    const tl = buildWorkoutTimeline({
      startedAtEpochMs: s(0),
      finishedAtEpochMs: s(600),
      sets: [ss('a', 'Curl', 100, 0), ss('b', 'Pushdown', 160, 1), ss('c', 'Curl', 220, 2), set('d', 'Row', 400, 90, 3)],
      hrSamples: hr,
    })!
    expect(tl.sets.map((x) => x.supersetGroup)).toEqual([1, 1, 1, null])
    const between = tl.segments.filter((x) => x.type !== 'set').map((x) => x.type)
    expect(between).toEqual(['warmup', 'rest', 'rest', 'transition', 'cooldown'])
  })

  it('does not call a single-exercise run a superset', () => {
    const ss = (id: string, at: number, order: number) => ({ ...set(id, 'Curl', at, 20, order), setType: 'superset' as const })
    const tl = buildWorkoutTimeline({ startedAtEpochMs: s(0), finishedAtEpochMs: s(600), sets: [ss('a', 100, 0), ss('b', 160, 1)], hrSamples: hr })!
    expect(tl.sets.every((x) => x.supersetGroup === null)).toBe(true)
  })

  it('returns null when nothing is timed', () => {
    expect(buildWorkoutTimeline({ startedAtEpochMs: s(0), finishedAtEpochMs: s(600), sets: [set('x', 'Bench', null, null, 0)], hrSamples: hr })).toBeNull()
  })
})
