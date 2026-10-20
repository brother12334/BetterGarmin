import { describe, expect, it } from 'vitest'
import type { DayRecord } from '../analytics/model'
import { capabilities, theilSen } from './engine'
import { circadian, healthTrajectory, illnessRadar, recoveryMomentum, sleepDebt, trueEnergy } from './features'

/** Deterministic pseudo-noise so tests are stable. */
const noise = (i: number, amp: number) => Math.sin(i * 12.9898) * amp

function makeDays(n: number, f: (i: number, base: DayRecord) => Partial<DayRecord> = () => ({})): DayRecord[] {
  const start = Date.parse('2026-06-01T12:00:00')
  return Array.from({ length: n }, (_, i) => {
    const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10)
    const bed = Date.parse(`${day}T23:00:00`) - 86_400_000 + noise(i, 0.3) * 3600_000
    const base: DayRecord = {
      day,
      restingHr: 55 + noise(i, 1.5),
      hrv: 45 + noise(i + 7, 4),
      sleepMinutes: 450 + noise(i + 3, 25),
      sleepScore: 75,
      bedtime: 11,
      steps: 8000 + noise(i, 1500),
      stressAvg: 30,
      sleepStartMs: bed,
      sleepEndMs: bed + 7.5 * 3600_000,
      awakeMinutes: 20 + noise(i, 5),
      spo2Avg: null,
      respirationAvg: 14 + noise(i + 2, 0.4),
    }
    return { ...base, ...f(i, base) }
  })
}

describe('engine', () => {
  it('Theil–Sen ignores a single wild point', () => {
    const pts: [number, number][] = [0, 1, 2, 3, 4, 5, 6].map((x) => [x, x * 2])
    pts[3][1] = 100
    expect(theilSen(pts)).toBe(2)
  })
  it('capability registry reports what exists and what does not', () => {
    const c = capabilities(makeDays(40))
    expect(c.hrv.available).toBe(true)
    expect(c.spo2.available).toBe(false)
    expect(c.hrv.recentDays).toBe(30)
  })
})

describe('features stay quiet without enough data', () => {
  const few = makeDays(10)
  it.each([
    ['momentum', recoveryMomentum],
    ['radar', illnessRadar],
    ['energy', trueEnergy],
  ])('%s calibrates', (_, f) => {
    const r = f(few)
    expect(r.state).toBe('calibrating')
    expect(r.confidence).toBe('insufficient')
  })
  it('no data at all is unavailable, not a number', () => {
    expect(sleepDebt([]).state).toBe('unavailable')
    expect(circadian([]).state).toBe('unavailable')
  })
})

describe('recovery momentum', () => {
  it('steady data is stable', () => {
    expect(recoveryMomentum(makeDays(60)).conclusion).toMatch(/steady/)
  })
  it('a week of low HRV and high resting HR is "away"', () => {
    const r = recoveryMomentum(makeDays(60, (i) => (i >= 53 ? { hrv: 32, restingHr: 62 } : {})))
    expect(r.view.markers.every((m) => m.direction === 'away')).toBe(true)
    expect(r.conclusion).toMatch(/away/)
  })
})

describe('illness radar', () => {
  it('one bad night on one marker does not flag', () => {
    expect(illnessRadar(makeDays(60, (i) => (i === 59 ? { restingHr: 66 } : {}))).view.status).toBe('normal')
  })
  it('resting HR up and respiration up together flags as elevated, with no probability', () => {
    const r = illnessRadar(makeDays(60, (i) => (i >= 58 ? { restingHr: 66, respirationAvg: 17 } : {})))
    expect(r.view.status).toBe('elevated')
    expect(r.conclusion).not.toMatch(/%|sick|infection/i)
  })
  it('two markers without resting HR or HRV do not flag', () => {
    expect(illnessRadar(makeDays(60, (i) => (i === 59 ? { respirationAvg: 18, awakeMinutes: 90 } : {}))).view.status).toBe('normal')
  })
})

describe('sleep debt', () => {
  it('adds the shortfall below 7 hours and ignores unrecorded nights', () => {
    const r = sleepDebt(makeDays(14, (i) => ({ sleepMinutes: i === 13 ? null : i >= 7 ? 360 : 480 })))
    expect(r.view.nights.slice(-7).reduce((a, n) => a + n.shortfall, 0)).toBe(6 * 60)
    expect(r.state).toBe('ready')
  })
})

describe('circadian', () => {
  it('finds later weekend sleep as social jetlag', () => {
    const r = circadian(
      makeDays(14, (_, b) => {
        const wake = new Date(b.sleepEndMs!).getDay()
        const shift = wake === 0 || wake === 6 ? 2 * 3600_000 : 0
        return { sleepStartMs: b.sleepStartMs! + shift, sleepEndMs: b.sleepEndMs! + shift }
      }),
    )
    const jl = r.contributors.find((c) => c.label === 'Social jetlag')!
    expect(parseFloat(jl.value)).toBeGreaterThan(1.5)
  })
})

describe('health trajectory', () => {
  it('a steadily falling resting HR reads as falling; noise alone reads as stable', () => {
    const falling = healthTrajectory(makeDays(120, (i) => ({ restingHr: 62 - i * 0.06 + noise(i, 1) })))
    expect(falling.view.domains.find((d) => d.key === 'restingHr')!.windows.find((w) => w.days === 90)!.trend).toBe('falling')
    const steady = healthTrajectory(makeDays(120))
    expect(steady.view.domains.find((d) => d.key === 'restingHr')!.windows.find((w) => w.days === 90)!.trend).toBe('stable')
  })
  it('never produces one combined health score', () => {
    expect(JSON.stringify(healthTrajectory(makeDays(120)))).not.toMatch(/overallScore|healthScore/)
  })
})
