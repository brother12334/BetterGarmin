import { Decoder, Stream } from '@garmin/fitsdk'

/**
 * Validates a file downloaded from the band and maps the parts BetterGarmin understands. Validation uses Garmin's
 * official FIT SDK: the header, declared size and file CRC must all check out before anything is imported.
 */

export interface BandActivity {
  sport: string | null
  subSport: string | null
  startTime: string | null
  /** Seconds. */
  elapsed: number | null
  timer: number | null
  calories: number | null
  avgHr: number | null
  maxHr: number | null
  /** Metres. */
  distance: number | null
  aerobicTE: number | null
  anaerobicTE: number | null
  /** Heart-rate samples (epoch ms, bpm). */
  hr: [number, number][]
}

export type FitResult =
  | { ok: true; fileType: string | null; activity: BandActivity | null; messageCounts: Record<string, number> }
  | { ok: false; error: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null)
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : null)

export function validateAndDecodeFit(bytes: Uint8Array, expectedSize: number | null): FitResult {
  if (expectedSize != null && bytes.length !== expectedSize) return { ok: false, error: `Expected ${expectedSize} bytes, received ${bytes.length}` }
  const stream = Stream.fromByteArray(Array.from(bytes))
  if (!Decoder.isFIT(stream)) return { ok: false, error: 'Not a FIT file (bad header or signature)' }
  const decoder = new Decoder(stream)
  if (!decoder.checkIntegrity()) return { ok: false, error: 'FIT integrity check failed (size or CRC mismatch)' }
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true, convertTypesToStrings: true, applyScaleAndOffset: true })
  if (errors.length) return { ok: false, error: `FIT decode error: ${String(errors[0])}` }
  const m = messages as Record<string, Record<string, unknown>[]>
  const counts = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.length]))
  const fileType = str(m.fileIdMesgs?.[0]?.type)
  const session = m.sessionMesgs?.[0]
  if (fileType !== 'activity' || !session) return { ok: true, fileType, activity: null, messageCounts: counts }
  const hr: [number, number][] = []
  for (const r of m.recordMesgs ?? []) {
    const t = r.timestamp instanceof Date ? r.timestamp.getTime() : null
    const v = num(r.heartRate)
    if (t != null && v != null) hr.push([t, v])
  }
  return {
    ok: true,
    fileType,
    messageCounts: counts,
    activity: {
      sport: str(session.sport),
      subSport: str(session.subSport),
      startTime: iso(session.startTime),
      elapsed: num(session.totalElapsedTime),
      timer: num(session.totalTimerTime),
      calories: num(session.totalCalories),
      avgHr: num(session.avgHeartRate),
      maxHr: num(session.maxHeartRate),
      distance: num(session.totalDistance),
      aerobicTE: num(session.totalTrainingEffect),
      anaerobicTE: num(session.totalAnaerobicTrainingEffect),
      hr,
    },
  }
}
