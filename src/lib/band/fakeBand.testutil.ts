import { concat, u16 } from './bytes'
import { CobsStream, cobsEncode } from './cobs'
import { MSG, configurationPayload, decodeFrame, encodeFrame, parseProtobufPayload } from './gfdi'
import { BAND_UUIDS, fragment } from './multilink'

/** A scripted stand-in for the band: answers registration, runs the handshake and replies to protobuf requests. */
export class FakeBand {
  configBits = [58, 90]
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
        this.sendFrame(encodeFrame(MSG.CONFIGURATION, configurationPayload(this.configBits, 15)))
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

