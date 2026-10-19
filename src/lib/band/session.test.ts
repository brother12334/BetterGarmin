import { afterEach, describe, expect, it } from 'vitest'
import { concat, u16 } from './bytes'
import { CobsStream, cobsEncode } from './cobs'
import { MSG, configurationPayload, decodeFrame, encodeFrame, parseProtobufPayload, protobufPayload } from './gfdi'
import { BAND_UUIDS, fragment } from './multilink'
import { decodeMessage } from './proto'
import { BandSession } from './session'
import { activityCommand } from './smart'
import { lfield, vfield } from './proto'

/** A scripted stand-in for the band: answers registration, runs the handshake and replies to protobuf requests. */
class FakeBand {
  handle = 18
  writes: Uint8Array[] = []
  frames: { messageId: number; payload: Uint8Array }[] = []
  private notifyListener: ((ev: Event) => void) | null = null
  private stream = new CobsStream()
  onProtobuf: (requestId: number, data: Uint8Array) => void = () => {}

  notify(bytes: Uint8Array) {
    const value = new DataView(bytes.slice().buffer)
    this.notifyListener?.({ target: { value } } as unknown as Event)
  }

  sendFrame(frame: Uint8Array) {
    for (const w of fragment(this.handle, cobsEncode(frame))) this.notify(w)
  }

  private onWrite(bytes: Uint8Array) {
    this.writes.push(bytes)
    if (bytes[0] === 0) {
      // Register request → response with our handle, then start the handshake with Device Information.
      this.notify(concat([0, 1], bytes.slice(2, 10), u16(1), [0, this.handle, 0]))
      this.sendFrame(encodeFrame(MSG.DEVICE_INFORMATION, concat(u16(151), u16(1), [0, 0, 0, 0], u16(1), u16(512), [5, ...new TextEncoder().encode('CIRQA')])))
      return
    }
    for (const raw of this.stream.push(bytes.slice(1))) {
      const r = decodeFrame(raw)
      if (!r.ok) throw new Error(r.error)
      this.frames.push(r.frame)
      const { messageId, payload } = r.frame
      if (messageId === MSG.ACK && payload[0] === 0xa0 && payload[1] === 0x13) {
        this.sendFrame(encodeFrame(MSG.CONFIGURATION, configurationPayload([58, 90], 15)))
      } else if (messageId === MSG.CONFIGURATION) {
        this.sendFrame(encodeFrame(MSG.ACK, [0xba, 0x13, 0x00]))
      } else if (messageId === MSG.PROTOBUF_REQUEST) {
        const c = parseProtobufPayload(payload)!
        this.sendFrame(encodeFrame(MSG.ACK, [...u16(MSG.PROTOBUF_REQUEST), 0, ...u16(c.requestId), 0, 0, 0, 0, 0, 0]))
        this.onProtobuf(c.requestId, c.data)
      }
    }
  }

  install() {
    const char = (uuid: string) =>
      ({
        properties: { write: true, writeWithoutResponse: true, notify: true, read: true },
        startNotifications: async () => char(uuid),
        addEventListener: (_: string, l: (ev: Event) => void) => {
          if (uuid === BAND_UUIDS.NOTIFY) this.notifyListener = l
        },
        removeEventListener: () => {},
        readValue: async () => new DataView(new Uint8Array([1, 2]).buffer),
        writeValueWithoutResponse: async (buf: ArrayBuffer) => {
          await Promise.resolve()
          this.onWrite(new Uint8Array(buf))
        },
      }) as unknown as BluetoothRemoteGATTCharacteristic
    const device = {
      name: 'CIRQA Smart Band',
      gatt: {
        connected: true,
        connect: async () => device.gatt,
        disconnect: () => {},
        getPrimaryService: async () => ({ getCharacteristic: async (uuid: string) => char(uuid) }),
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    Object.defineProperty(globalThis, 'navigator', { value: { bluetooth: { requestDevice: async () => device } }, configurable: true })
  }
}

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
