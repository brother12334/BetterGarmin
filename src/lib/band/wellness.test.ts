import { describe, expect, it } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { decodeWellness, emptyWellness } from './wellness'
import { crc16Arc } from './crc'
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
  for (let i = 0; i < 4; i++) e.onMesg(Profile.MesgNum.SPO2_DATA, { timestamp: new Date(start.getTime() + 3600_000 + i * 600_000), readingSpo2: 94 + i, readingConfidence: 3 })
  e.onMesg(Profile.MesgNum.HRV_STATUS_SUMMARY, { timestamp: new Date(start.getTime() + 9 * 3600_000), weeklyAverage: 48, lastNightAverage: 52, lastNight5MinHigh: 70, baselineBalancedLower: 40, baselineBalancedUpper: 55, status: 'balanced' })
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
    expect(w.spo2.map((x) => x.v)).toEqual([94, 95, 96, 97])
    expect(w.hrvSummaries[0]).toMatchObject({ weekly: 48, lastNight: 52, high5min: 70, baselineLow: 40, baselineHigh: 55, status: 'balanced' })
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
    expect(garmin.statements.find((s) => s.sql.includes('INTO hrv'))?.params).toEqual(['2026-10-19', 48, 52, 70, 40, 55, 'balanced'])
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

/** A FIT file with one undocumented message, written by hand (the SDK encoder only writes documented ones). */
function rawFit(globalNum: number, fields: [num: number, size: 1 | 2 | 4, value: number][]): Uint8Array {
  const def = [0x40, 0, 0, ...u16le(globalNum), fields.length, ...fields.flatMap(([n, size]) => [n, size, size === 1 ? 0x02 : size === 2 ? 0x84 : 0x86])]
  const data = [0x00, ...fields.flatMap(([, size, v]) => Array.from({ length: size }, (_, i) => (v >>> (8 * i)) & 0xff))]
  const body = [...def, ...data]
  const header = [14, 0x20, ...u16le(2195), ...u32le(body.length), 0x2e, 0x46, 0x49, 0x54]
  const headerCrc = crc16Arc(Uint8Array.from(header))
  const withHeader = [...header, ...u16le(headerCrc), ...body]
  return Uint8Array.from([...withHeader, ...u16le(crc16Arc(Uint8Array.from(withHeader)))])
}
const u16le = (v: number) => [v & 0xff, (v >> 8) & 0xff]
const u32le = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]

describe('Firstbeat backup sleep summaries (message 411)', () => {
  // Values from the real band's Oct 16–17 night, whose sleep file showed: score 49, deep 88, light 408, REM 58, awake 124.
  const start = 1161145827
  const end = 1161188367
  const fit = rawFit(411, [
    [0, 1, 49],
    [1, 2, 88],
    [2, 2, 408],
    [3, 2, 58],
    [4, 2, 124],
    [5, 2, 31],
    [8, 4, end],
    [10, 4, start],
  ])

  it('maps score, stage minutes and times', () => {
    const w = decodeWellness(fit)!
    expect(w.fbtNights).toEqual([{ start: (start + FIT_EPOCH_S) * 1000, end: (end + FIT_EPOCH_S) * 1000, score: 49, deep: 88, light: 408, rem: 58, awake: 124 }])
    const sleep = wellnessOverlays(w).garmin.statements.find((s) => s.sql.includes('INTO sleep ('))!
    expect(sleep.params.slice(3, 9)).toEqual(['09:14:00', '01:28:00', '06:48:00', '00:58:00', '02:04:00', 49])
  })

  it('ignores a record whose minutes do not add up', () => {
    const bad = rawFit(411, [
      [0, 1, 49],
      [1, 2, 300],
      [2, 2, 408],
      [3, 2, 58],
      [4, 2, 124],
      [5, 2, 31],
      [8, 4, end],
      [10, 4, start],
    ])
    expect(decodeWellness(bad)?.fbtNights ?? []).toEqual([])
  })

  it('counts steps across a counter reset that isn\'t at local midnight', () => {
    const w = emptyWellness()
    const t0 = new Date(2026, 9, 26, 9, 0).getTime()
    // 100 → 300 (+200), reset → 50 (+50), → 80 (+30), all on the same local day.
    w.steps = [100, 300, 50, 80].map((total, i) => ({ t: t0 + i * 3600_000, type: 'walking', total }))
    const day = wellnessOverlays(w).garmin.statements.find((st) => st.sql.startsWith('UPDATE daily_summary'))!
    expect(day.params[4]).toBe(280)
  })
})
