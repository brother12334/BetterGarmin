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
  /** Any other frame the host sends (e.g. legacy file transfer). */
  onFrame: (messageId: number, payload: Uint8Array) => void = (id) => {
    // By default the older file transfer is refused (download status 1 = index unknown).
    if (id === 5007) this.sendFrame(encodeFrame(MSG.ACK, [...u16(5007), 0]))
    if (id === 5002) this.sendFrame(encodeFrame(MSG.ACK, [...u16(5002), 0, 1, 0, 0, 0, 0]))
  }
  /** Extra service registrations (file pipes): return [status, handle]. */
  onRegister: (service: number, options: number) => [number, number] = () => [1, 0]
  /** Packets written on a reliable handle (high bit set). */
  onReliable: (packet: Uint8Array) => void = () => {}
  closes: { service: number; handle: number }[] = []

  notify(bytes: Uint8Array) {
    const value = new DataView(bytes.slice().buffer)
    this.notifyListener?.({ target: { value } } as unknown as Event)
  }

  sendFrame(frame: Uint8Array) {
    for (const w of fragment(this.handle, cobsEncode(frame))) this.notify(w)
  }

  private onWrite(bytes: Uint8Array) {
    this.writes.push(bytes)
    if (bytes[0] & 0x80) {
      this.onReliable(bytes)
      return
    }
    if (bytes[0] === 0 && bytes[1] === 2) {
      // Close-handle request → close response.
      const service = bytes[10] | (bytes[11] << 8)
      this.closes.push({ service, handle: bytes[12] })
      this.notify(concat([0, 3], bytes.slice(2, 10), u16(service), [bytes[12], 0]))
      return
    }
    if (bytes[0] === 0 && (bytes[10] | (bytes[11] << 8)) !== 1) {
      const service = bytes[10] | (bytes[11] << 8)
      const [status, handle] = this.onRegister(service, bytes[12])
      this.notify(concat([0, 1], bytes.slice(2, 10), u16(service), [status, handle, bytes[12]]))
      return
    }
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
      } else {
        this.onFrame(messageId, payload)
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
      id: 'fake-cirqa',
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

