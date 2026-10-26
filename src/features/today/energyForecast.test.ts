import { describe, expect, it } from 'vitest'
import { forecastEnergy, MIN_DAYS, type EnergySample } from './energyForecast'

const at = (day: string, hour: number, value: number): EnergySample => ({ timestamp: `${day} ${String(hour).padStart(2, '0')}:30:00`, value })

describe('forecastEnergy', () => {
  it('adds the median change from past days to the current level', () => {
    const samples: EnergySample[] = []
    // Five past days: from 10:00 to 18:00 energy fell by 20, 25, 30, 35 and 40.
    ;[20, 25, 30, 35, 40].forEach((drop, i) => {
      const day = `2026-10-0${i + 1}`
      samples.push(at(day, 10, 80), at(day, 18, 80 - drop))
    })
    samples.push(at('2026-10-26', 10, 60))
    const f = forecastEnergy(samples, '2026-10-26')!
    expect(f.now).toEqual({ hour: 10, value: 60 })
    expect(f.points).toEqual([{ hour: 18, low: 25, mid: 30, high: 35, days: 5 }])
  })

  it('leaves out hours with too few past days instead of guessing', () => {
    const samples: EnergySample[] = []
    for (let i = 1; i < MIN_DAYS; i++) samples.push(at(`2026-10-0${i}`, 9, 70), at(`2026-10-0${i}`, 15, 50))
    samples.push(at('2026-10-26', 9, 65))
    expect(forecastEnergy(samples, '2026-10-26')!.points).toEqual([])
  })

  it('returns nothing without a reading today', () => {
    expect(forecastEnergy([at('2026-10-01', 9, 70)], '2026-10-26')).toBeNull()
  })
})
