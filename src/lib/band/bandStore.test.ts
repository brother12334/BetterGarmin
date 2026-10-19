import { afterEach, describe, expect, it } from 'vitest'
import capture from './fixtures/cirqa-real-workout-excerpt.json'
import { fromHex } from './bytes'
import { FakeBand } from './fakeBand.testutil'
import { MSG, encodeFrame, protobufPayload } from './gfdi'
import { lfield, vfield } from './proto'
import { band, bandActivityReady, getActivitySnapshotForTests as snapshot, prepareActivity, sendActivityCommand } from './bandStore'

const reply = (fake: FakeBand, requestId: number, smart: number[]) =>
  fake.sendFrame(encodeFrame(MSG.PROTOBUF_RESPONSE, protobufPayload({ requestId, offset: 0, total: smart.length, data: Uint8Array.from(smart) })))

/** Real notification packets by annotation; they are re-routed to the fake's handle. */
const realPacket = (annotation: string) => fromHex(capture.notifications.find((n) => n.annotation === annotation)!.hex)

const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('condition not met')
    await new Promise((r) => setTimeout(r, 5))
  }
}

afterEach(() => {
  band.disconnect()
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
})

describe('band store: real workout events drive command tracking', () => {
  it('prepares LiveSession, then START goes sent → accepted → confirmed and SAVE confirms on SAVING / ENDED', async () => {
    const fake = new FakeBand()
    fake.handle = capture.assignedHandle
    fake.configBits = [9, 58, 81, 90, 95, 105]
    let commandCount = 0
    fake.onProtobuf = (requestId, data) => {
      const top = data[0] | (data[1] << 8)
      if (top === 0x056a) reply(fake, requestId, lfield(13, lfield(9, lfield(35, vfield(1, 1)))))
      else if (data[3] === 0x22) reply(fake, requestId, lfield(30, lfield(5, vfield(1, 19))))
      else if (data[3] === 0x0a) reply(fake, requestId, lfield(30, lfield(2, lfield(1, [...vfield(1, 0), ...lfield(2, vfield(1, 19))]))))
      else {
        // Activity command: answer with the real response packet, then the real band events that followed it.
        commandCount++
        const sequence =
          commandCount === 1 ? ['INITIAL_START response', 'ActivityStartRequest', 'START', 'WORKOUT_ACTIVE'] : ['SAVE response', 'STOP after save', 'SAVING', 'ENDED / SAVED']
        for (const a of sequence) {
          // Responses are re-sent with this request's ID (same body as captured: LiveSession 18, no failure);
          // band events are the original captured packets, unmodified.
          if (a.endsWith('response')) reply(fake, requestId, [0xc2, 0x03, 0x03, 0x92, 0x01, 0x00])
          else fake.notify(realPacket(a))
        }
      }
    }
    fake.install()
    await band.connect()
    await prepareActivity()
    await until(() => bandActivityReady())

    expect(sendActivityCommand('START')).toBe(true)
    expect(sendActivityCommand('START')).toBe(false) // duplicate start refused while pending
    await until(() => snapshot().command?.stage === 'confirmed')
    expect(snapshot().uuid).toEqual({ mostSignificant: 'a3 48 c4 b0 74 08 1f 6e', leastSignificant: '62 f7 e3 ed f1 58 8d 8c' })
    expect(snapshot().profile).toEqual({ sport: 10, subSport: 20 })

    expect(sendActivityCommand('SAVE')).toBe(true)
    await until(() => snapshot().command?.command === 'SAVE' && snapshot().command?.stage === 'confirmed')
    expect(snapshot().bandState).toBe('ENDED')
  })
})
