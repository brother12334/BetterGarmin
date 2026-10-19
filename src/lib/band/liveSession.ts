import { decodeMessage, type ProtoField } from './proto'
import { LIVE, SMART } from './smart'

/**
 * Decoders for LiveSession traffic, following the schema recovered in the CIRQA developer packet:
 *   Smart 30 (event_sharing) → 3 (alert_notification) → ext 1012 (live_session_event)
 *     → 1 activity_start_request { 1 uuid { fixed64 1 most_significant, fixed64 2 least_significant }, 2 sport_profile { 1 sport, 2 sub_sport } }
 *     → 2 activity_state_request { 1 state, 2 end_reason }
 *     → 3 activity data
 *   Smart 56 → 18 app_initiated_activity_command_response { 1 failure (absent = accepted) }
 */

export const ACTIVITY_STATES = [
  'START',
  'STOP',
  'PAUSE',
  'RESUME',
  'ENDED',
  'SAVING',
  'DISCARDING',
  'WORKOUT_ENDED',
  'WORKOUT_WARMUP',
  'WORKOUT_ACTIVE',
  'WORKOUT_REST',
  'WORKOUT_COOLDOWN',
] as const
export type ActivityStateName = (typeof ACTIVITY_STATES)[number] | `STATE_${number}`

export const END_REASONS = ['SAVED', 'DISCARDED'] as const

/** The two halves of the band's activity UUID, kept as their raw little-endian wire bytes (never converted to Number). */
export interface ActivityUuid {
  mostSignificant: string
  leastSignificant: string
}

export type LiveSessionEvent =
  | { kind: 'start'; uuid: ActivityUuid | null; sport: number | null; subSport: number | null }
  | { kind: 'state'; state: ActivityStateName; endReason: (typeof END_REASONS)[number] | `REASON_${number}` | null }
  | { kind: 'data' }

const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ')

/** All values of `field`, failing on wire types other than expected so malformed data isn't misread. */
function all(fields: ProtoField[] | null, field: number, wire: ProtoField['wire']): ProtoField[] {
  const hits = fields?.filter((f) => f.field === field) ?? []
  if (hits.some((f) => f.wire !== wire)) throw new Error(`Field ${field} has an unexpected wire type`)
  return hits
}
function one(fields: ProtoField[] | null, field: number, wire: ProtoField['wire']): ProtoField | null {
  const hits = all(fields, field, wire)
  if (hits.length > 1) throw new Error(`Duplicate singular field ${field}`)
  return hits[0] ?? null
}
function msg(fields: ProtoField[] | null, field: number): ProtoField[] | null {
  const f = one(fields, field, 2)
  if (!f) return null
  const decoded = decodeMessage(f.value as Uint8Array)
  if (!decoded) throw new Error(`Field ${field} is not a valid message`)
  return decoded
}
function uint(fields: ProtoField[] | null, field: number): number | null {
  const f = one(fields, field, 0)
  return f == null ? null : Number(f.value)
}

/** LiveSession events inside a band-initiated Smart message (5043), or [] if it carries none. */
export function decodeLiveSessionEvents(smart: ProtoField[] | null): LiveSessionEvent[] {
  const live = msg(msg(msg(smart, SMART.EVENT_SHARING), 3), 1012)
  if (!live) return []
  const events: LiveSessionEvent[] = []
  const start = msg(live, 1)
  if (start) {
    const uuidMsg = msg(start, 1)
    const ms = one(uuidMsg, 1, 1)
    const ls = one(uuidMsg, 2, 1)
    const profile = msg(start, 2)
    events.push({
      kind: 'start',
      uuid: ms && ls ? { mostSignificant: hexOf(ms.value as Uint8Array), leastSignificant: hexOf(ls.value as Uint8Array) } : null,
      sport: uint(profile, 1),
      subSport: uint(profile, 2),
    })
  }
  const state = msg(live, 2)
  if (state) {
    const s = uint(state, 1)
    const r = uint(state, 2)
    if (s != null) {
      events.push({
        kind: 'state',
        state: ACTIVITY_STATES[s] ?? `STATE_${s}`,
        endReason: r == null ? null : (END_REASONS[r] ?? `REASON_${r}`),
      })
    }
  }
  if (msg(live, 3)) events.push({ kind: 'data' })
  return events
}

/** Result of an activity command: accepted when the matched response has no failure field. */
export function decodeCommandResponse(smart: ProtoField[] | null): { accepted: true } | { accepted: false; failure: number } {
  const response = msg(msg(smart, SMART.LIVE_SESSION), LIVE.COMMAND_RESPONSE)
  if (!response) throw new Error('Not an activity command response')
  const failure = uint(response, 1)
  return failure == null ? { accepted: true } : { accepted: false, failure }
}

/** LiveSession capabilities (Smart 13 → 9 → 35): whether the band lets the app end activities remotely. */
export function decodeLiveSessionCapabilities(smart: ProtoField[] | null): { allowRemoteTerminate: boolean; version: number } {
  const live = msg(msg(msg(smart, SMART.CORE), 9), 35)
  if (!live) throw new Error('Missing LiveSession capability response')
  return { allowRemoteTerminate: uint(live, 1) === 1, version: uint(live, 2) ?? 1 }
}

/** EventSharing supported alerts (Smart 30 → 5 → repeated 1, possibly packed). */
export function decodeSupportedAlerts(smart: ProtoField[] | null): number[] {
  const body = msg(msg(smart, SMART.EVENT_SHARING), 5)
  if (!body) throw new Error('Missing EventSharing alert list')
  const out: number[] = []
  for (const f of body.filter((x) => x.field === 1)) {
    if (f.wire === 0) out.push(Number(f.value))
    else if (f.wire === 2) {
      const b = f.value as Uint8Array
      let i = 0
      while (i < b.length) {
        let v = 0
        let shift = 0
        while (i < b.length) {
          const x = b[i++]
          v += (x & 0x7f) * 2 ** shift
          shift += 7
          if (!(x & 0x80)) break
        }
        out.push(v)
      }
    }
  }
  return out
}

/** Subscription result (Smart 30 → 2 → repeated 1 { 1 status, 2 { 1 alert_type } }): true when alert 19 reports status 0. */
export function decodeSubscribed(smart: ProtoField[] | null, alertType = 19): boolean {
  const body = msg(msg(smart, SMART.EVENT_SHARING), 2)
  for (const f of body?.filter((x) => x.field === 1 && x.wire === 2) ?? []) {
    const status = decodeMessage(f.value as Uint8Array)
    const type = msg(status, 2)
    if (uint(type, 1) === alertType) return uint(status, 1) === 0
  }
  return false
}

/** Find My Watch response (Smart 12 → 2, or 4 for cancel) status: 100 = OK, 200 = ERROR. */
export function decodeLocateStatus(smart: ProtoField[] | null, cancel: boolean): number {
  const status = uint(msg(msg(smart, SMART.FIND_MY_WATCH), cancel ? 4 : 2), 1)
  if (status == null) throw new Error('Locate response has no explicit status')
  return status
}
