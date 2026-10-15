import { describe, expect, it } from 'vitest'
import type { ActivityRow } from '../../db/types'
import { suggestClockOffset } from './matchGarminActivity'

const pad = (n: number) => String(n).padStart(2, '0')
const naive = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const act = (id: string, start: number, mins: number, sub = 'strength_training'): ActivityRow =>
  ({ activity_id: id, sport: 'training', sub_sport: sub, start_time: naive(start), stop_time: naive(start + mins * 60000) }) as ActivityRow

const T = new Date(2026, 9, 8, 18, 0, 0).getTime()
const H = 3_600_000
const workout = { startedAtEpochMs: T, finishedAtEpochMs: T + H }

describe('suggestClockOffset', () => {
  it('returns null when the logged times already overlap a strength activity', () => {
    expect(suggestClockOffset(workout, [act('a', T + 5 * 60000, 55)])).toBeNull()
  })

  it('finds a time-zone shift when the watch activity is hours away', () => {
    const s = suggestClockOffset(workout, [act('a', T + 2 * H, 60)])!
    expect(s.offsetMs).toBe(2 * H)
    expect(s.overlap).toBeCloseTo(1)
  })

  it('handles half-hour time zones and negative shifts', () => {
    expect(suggestClockOffset(workout, [act('a', T - 5.5 * H, 60)])!.offsetMs).toBe(-5.5 * H)
  })

  it('ignores non-strength activities and refuses ambiguous matches', () => {
    expect(suggestClockOffset(workout, [act('run', T + 2 * H, 60, 'generic')])).toBeNull()
    expect(suggestClockOffset(workout, [act('a', T + 2 * H, 60), act('b', T - 3 * H, 60)])).toBeNull()
  })

  it('refuses weak overlaps', () => {
    expect(suggestClockOffset(workout, [act('a', T + 2 * H, 20)])).toBeNull()
  })
})
