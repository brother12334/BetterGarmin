import { afterEach, describe, expect, it } from 'vitest'
import { MSG, encodeFrame, protobufPayload } from './gfdi'
import { decodeMessage } from './proto'
import { BandSession } from './session'
import { FakeBand } from './fakeBand.testutil'
import { activityCommand } from './smart'
import { lfield, vfield } from './proto'

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
})

describe('BandSession against a simulated band', () => {
  it('registers, uses the returned routing handle, completes the handshake and routes a command response', async () => {
    const fake = new FakeBand()
    fake.install()
    const session = new BandSession()
    await session.connect()
    expect(session.state).toBe('ready')
    expect(session.routingHandle).toBe(18)
    expect(session.bandConfigBits).toEqual([58, 90])
    expect(session.bandProtocolVersion).toBe(151)
    // Every GFDI write after registration used handle 18, never a hardcoded one.
    expect(fake.writes.slice(1).every((w) => w[0] === 18)).toBe(true)
    // Ack for the band's configuration came before our own configuration.
    const ids = fake.frames.map((f) => f.messageId)
    expect(ids.indexOf(MSG.ACK, 1)).toBeLessThan(ids.indexOf(MSG.CONFIGURATION))

    fake.onProtobuf = (requestId, data) => {
      expect(Array.from(data)).toEqual(activityCommand('START'))
      const response = Uint8Array.from(lfield(56, lfield(18, vfield(1, 0))))
      fake.sendFrame(encodeFrame(MSG.PROTOBUF_RESPONSE, protobufPayload({ requestId, offset: 0, total: response.length, data: response })))
    }
    const sent = session.sendSmart(activityCommand('START'), 'start')
    await sent.delivered
    const resp = await sent.response
    expect(resp.requestId).toBe(sent.requestId)
    expect(decodeMessage(resp.raw)?.[0].field).toBe(56)
    // The band's response was acknowledged with its request ID.
    const lastAck = fake.frames.filter((f) => f.messageId === MSG.ACK).pop()!
    expect(lastAck.payload[0] | (lastAck.payload[1] << 8)).toBe(MSG.PROTOBUF_RESPONSE)
  })
})
