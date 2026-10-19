import { Decoder, Stream } from '@garmin/fitsdk'

/**
 * All-day ("wellness") data from the band's FIT files: monitoring (heart rate, steps), stress, Body Battery and
 * sleep. These are the files the band keeps for Garmin Connect's daily views. Every file is integrity-checked with
 * Garmin's FIT SDK before anything is read from it.
 *
 * Body Battery isn't in the public FIT profile; on recent Garmin devices it rides in the stress_level message as
 * undocumented field 3 ("body energy", as decoded by Gadgetbridge). It's only accepted when it's a plausible 0–100.
 */

export interface TimedValue {
  t: number // epoch ms
  v: number
}

export type SleepStage = 'awake' | 'light' | 'deep' | 'rem'

export interface WellnessData {
  stress: TimedValue[]
  bodyBattery: TimedValue[]
  hr: TimedValue[]
  /** Cumulative step counters per activity type, as the band logs them. */
  steps: { t: number; type: string; total: number }[]
  restingHr: TimedValue[]
  sleepLevels: { t: number; stage: SleepStage | null }[]
  /** Overall sleep score, timed at the end of the file's sleep data. */
  sleepScores: TimedValue[]
  /** Message counts by number, for the protocol log (no values). */
  counts: Record<string, number>
}

const MESG = { MONITORING: 55, MONITORING_HR: 211, STRESS: 227, SLEEP_LEVEL: 275, SLEEP_ASSESSMENT: 346 }
/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
const FIT_EPOCH_S = 631065600

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const ms = (v: unknown): number | null => (v instanceof Date ? v.getTime() : null)

export function emptyWellness(): WellnessData {
  return { stress: [], bodyBattery: [], hr: [], steps: [], restingHr: [], sleepLevels: [], sleepScores: [], counts: {} }
}

/** Decodes one wellness FIT file. Returns null when the file isn't valid FIT. */
export function decodeWellness(bytes: Uint8Array): WellnessData | null {
  const stream = Stream.fromByteArray(Array.from(bytes))
  if (!Decoder.isFIT(stream)) return null
  const decoder = new Decoder(stream)
  if (!decoder.checkIntegrity()) return null
  const out = emptyWellness()
  // Monitoring samples often carry only a 16-bit timestamp, resolved against the last full one, in file order.
  let lastFull: number | null = null // FIT-epoch seconds
  let lastActivity = 'generic'

  const listener = (mesgNum: number, m: Record<string | number, unknown>) => {
    out.counts[mesgNum] = (out.counts[mesgNum] ?? 0) + 1
    const full = ms(m.timestamp)
    if (full != null) lastFull = Math.floor(full / 1000) - FIT_EPOCH_S
    switch (mesgNum) {
      case MESG.MONITORING: {
        let t = full
        const t16 = num(m.timestamp16)
        if (t == null && t16 != null && lastFull != null) {
          const resolved = lastFull + ((t16 - (lastFull & 0xffff)) & 0xffff)
          lastFull = resolved
          t = (resolved + FIT_EPOCH_S) * 1000
        }
        if (t == null) return
        if (typeof m.activityType === 'string') lastActivity = m.activityType
        const hr = num(m.heartRate)
        if (hr != null && hr > 0 && hr < 255) out.hr.push({ t, v: hr })
        const steps = num(m.steps) ?? (lastActivity === 'walking' || lastActivity === 'running' ? num(m.cycles) : null)
        if (steps != null) out.steps.push({ t, type: lastActivity, total: steps })
        return
      }
      case MESG.MONITORING_HR: {
        const rhr = num(m.restingHeartRate)
        if (full != null && rhr != null && rhr > 0) out.restingHr.push({ t: full, v: rhr })
        return
      }
      case MESG.STRESS: {
        const t = ms(m.stressLevelTime) ?? full
        if (t == null) return
        const stress = num(m.stressLevelValue)
        if (stress != null) out.stress.push({ t, v: stress })
        const energy = num(m[3])
        if (energy != null && energy >= 0 && energy <= 100) out.bodyBattery.push({ t, v: energy })
        return
      }
      case MESG.SLEEP_LEVEL: {
        if (full == null) return
        const s = m.sleepLevel
        out.sleepLevels.push({ t: full, stage: s === 'awake' || s === 'light' || s === 'deep' || s === 'rem' ? s : null })
        return
      }
      case MESG.SLEEP_ASSESSMENT: {
        const score = num(m.overallSleepScore)
        const at = full ?? (lastFull != null ? (lastFull + FIT_EPOCH_S) * 1000 : null)
        if (score != null && score <= 100 && at != null) out.sleepScores.push({ t: at, v: score })
        return
      }
    }
  }

  const { errors } = decoder.read({ mesgListener: listener as never, includeUnknownData: true, mergeHeartRates: false })
  if (errors.length) return null
  return out
}

export function mergeWellness(parts: WellnessData[]): WellnessData {
  const all = emptyWellness()
  for (const p of parts) {
    all.stress.push(...p.stress)
    all.bodyBattery.push(...p.bodyBattery)
    all.hr.push(...p.hr)
    all.steps.push(...p.steps)
    all.restingHr.push(...p.restingHr)
    all.sleepLevels.push(...p.sleepLevels)
    all.sleepScores.push(...p.sleepScores)
    for (const [k, n] of Object.entries(p.counts)) all.counts[k] = (all.counts[k] ?? 0) + n
  }
  for (const k of ['stress', 'bodyBattery', 'hr', 'steps', 'restingHr', 'sleepLevels', 'sleepScores'] as const) (all[k] as { t: number }[]).sort((a, b) => a.t - b.t)
  return all
}

export function hasWellness(w: WellnessData): boolean {
  return w.stress.length + w.bodyBattery.length + w.hr.length + w.steps.length + w.sleepLevels.length > 0
}
