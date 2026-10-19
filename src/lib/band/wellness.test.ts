import { describe, expect, it } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { decodeWellness } from './wellness'
import { nights, wellnessOverlays } from './wellnessSql'

const FIT_EPOCH_S = 631065600

function wellnessFit(): Uint8Array {
  const e = new Encoder() as unknown as { onMesg(n: number, m: Record<string, unknown>): void; close(): Uint8Array }
  const start = new Date('2026-10-18T22:00:00')
  const s0 = Math.floor(start.getTime() / 1000)
  e.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 0, timeCreated: start, type: 'monitoringB' })
  e.onMesg(Profile.MesgNum.MONITORING, { timestamp: start, activityType: 'walking', steps: 100, heartRate: 60 })
  // Later samples carry only a 16-bit timestamp, which crosses a 65536-second boundary somewhere in the night.
  for (let i = 1; i <= 10; i++) {
    const t = s0 + i * 3600 - FIT_EPOCH_S
    e.onMesg(Profile.MesgNum.MONITORING, { timestamp16: t & 0xffff, heartRate: 60 + i, steps: 100 + i * 50 })
  }
  for (let i = 0; i < 6; i++) e.onMesg(Profile.MesgNum.STRESS_LEVEL, { stressLevelValue: 20 + i, stressLevelTime: new Date(start.getTime() + i * 180_000) })
  const stages = ['light', 'deep', 'deep', 'rem', 'light', 'awake']
  for (let i = 0; i < 8 * 60; i++) e.onMesg(Profile.MesgNum.SLEEP_LEVEL, { timestamp: new Date(start.getTime() + 3600_000 + i * 60_000), sleepLevel: stages[Math.floor(i / 80)] })
  e.onMesg(Profile.MesgNum.SLEEP_ASSESSMENT, { overallSleepScore: 81 })
  return e.close()
}

describe('band wellness files', () => {
  it('decodes monitoring (with 16-bit timestamps), stress and sleep', () => {
    const w = decodeWellness(wellnessFit())!
    expect(w).not.toBeNull()
    expect(w.hr.map((h) => h.v)).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70])
    const start = new Date('2026-10-18T22:00:00').getTime()
    expect(w.hr.map((h) => (h.t - start) / 3600_000)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(w.stress.length).toBe(6)
    expect(w.sleepLevels.length).toBe(480)
    expect(w.sleepScores.map((s) => s.v)).toEqual([81])
  })

  it('maps a night of sleep and daily totals into dashboard rows', () => {
    const w = decodeWellness(wellnessFit())!
    const [n] = nights(w)
    expect(n.day).toBe('2026-10-19')
    expect(n.score).toBe(81)
    const { garmin, monitoring } = wellnessOverlays(w)
    const sleep = garmin.statements.find((s) => s.sql.includes('INTO sleep ('))!
    // 80 min light ×2 = 2:40, deep 2:40, rem 1:20, awake 1:20.
    expect(sleep.params.slice(3, 8)).toEqual(['06:40:00', '02:40:00', '02:40:00', '01:20:00', '01:20:00'])
    expect(garmin.statements.filter((s) => s.sql.startsWith('INSERT OR REPLACE INTO stress')).length).toBe(6)
    expect(monitoring.statements.filter((s) => s.sql.includes('monitoring_hr')).length).toBe(11)
  })

  it('finds the FIT file when the transfer put extra bytes in front of it', () => {
    const fit = wellnessFit()
    const prefixed = new Uint8Array(fit.length + 3)
    prefixed.set([0, 0, 0])
    prefixed.set(fit, 3)
    expect(decodeWellness(prefixed)?.stress.length).toBe(6)
  })

  it('rejects a corrupted file', () => {
    const b = wellnessFit()
    b[50] ^= 0xff
    expect(decodeWellness(b)).toBeNull()
  })
})
