import { describe, expect, it } from 'vitest'
import capture from './fixtures/cirqa-real-workout-excerpt.json'
import { fromHex, hex } from './bytes'
import { CobsStream } from './cobs'
import { MSG, decodeFrame, parseProtobufPayload } from './gfdi'
import { decodeCommandResponse, decodeLiveSessionEvents, type LiveSessionEvent } from './liveSession'
import { decodeMessage } from './proto'
import { activityCommand } from './smart'

/**
 * Replays 12 original notification packets from one real CIRQA workout (Protocol Lab capture, CIRQA developer
 * packet): start, pause, resume, save. Nothing here is synthesized.
 */
describe('real CIRQA workout replay', () => {
  const stream = new CobsStream()
  const decoded = capture.notifications.map((n) => {
    const bytes = fromHex(n.hex)
    expect(bytes[0]).toBe(capture.assignedHandle)
    const frames = stream.push(bytes.slice(1))
    expect(frames).toHaveLength(1)
    const r = decodeFrame(frames[0])
    if (!r.ok) throw new Error(`${n.annotation}: ${r.error}`)
    const chunk = parseProtobufPayload(r.frame.payload)!
    expect(chunk.total).toBe(chunk.data.length)
    return { annotation: n.annotation, messageId: r.frame.messageId, fields: decodeMessage(chunk.data) }
  })

  it('every packet passes length and CRC checks', () => {
    expect(decoded).toHaveLength(12)
  })

  it('our command payloads match the ones the real session sent', () => {
    const ours = { INITIAL_START: activityCommand('START'), PAUSE: activityCommand('PAUSE'), RESUME: activityCommand('RESUME'), SAVE: activityCommand('SAVE') }
    for (const c of capture.commands) expect(hex(ours[c.command as keyof typeof ours])).toBe(c.smartPayloadHex)
  })

  it('the four command responses are accepted (no failure field)', () => {
    const responses = decoded.filter((d) => d.messageId === MSG.PROTOBUF_RESPONSE)
    expect(responses.map((r) => r.annotation)).toEqual(['INITIAL_START response', 'PAUSE response', 'RESUME response', 'SAVE response'])
    for (const r of responses) expect(decodeCommandResponse(r.fields)).toEqual({ accepted: true })
  })

  it('decodes the state sequence START, WORKOUT_ACTIVE, STOP, START, STOP, SAVING, ENDED (SAVED)', () => {
    const events: LiveSessionEvent[] = decoded.filter((d) => d.messageId === MSG.PROTOBUF_REQUEST).flatMap((d) => decodeLiveSessionEvents(d.fields))
    const states = events.filter((e) => e.kind === 'state').map((e) => (e.kind === 'state' ? `${e.state}${e.endReason ? `/${e.endReason}` : ''}` : ''))
    expect(states).toEqual(['START', 'WORKOUT_ACTIVE', 'STOP', 'START', 'STOP', 'SAVING', 'ENDED/SAVED'])
  })

  it('reads the activity UUID halves and Strength 10/20 from the ActivityStartRequest only', () => {
    const start = decoded.find((d) => d.annotation === 'ActivityStartRequest')!
    const [event] = decodeLiveSessionEvents(start.fields)
    expect(event).toEqual({
      kind: 'start',
      uuid: { mostSignificant: 'a3 48 c4 b0 74 08 1f 6e', leastSignificant: '62 f7 e3 ed f1 58 8d 8c' },
      sport: 10,
      subSport: 20,
    })
  })
})
