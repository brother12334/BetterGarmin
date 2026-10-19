import { describe, expect, it } from 'vitest'
import { fromHex, hex } from './bytes'
import { CobsStream, cobsDecode, cobsEncode } from './cobs'
import { crc16Arc } from './crc'
import { MSG, configurationPayload, decodeFrame, encodeFrame, hostConfiguration, hostDeviceInformation, parseProtobufPayload, protobufPayload, readConfigurationBits, HOST_CONFIG_BITS } from './gfdi'
import { fragment, parseRegisterResponse, registerRequest } from './multilink'
import { decodeMessage, describe as describeProto } from './proto'
import { activityCommand, cancelFindMyWatch, eventSharingSupportedAlerts, fileAccessCapabilities, fileListRequest, findMyWatch, liveSessionCapabilities, subscribeLiveSessionEvents } from './smart'

// Byte strings below are from the real-device captures in the CIRQA findings.
describe('GFDI framing', () => {
  it('reproduces the tested host Device Information response', () => {
    expect(hex(hostDeviceInformation())).toBe(
      '38 00 88 13 a0 13 00 71 00 ff ff ff ff ff ff 01 00 ff ff 0c 42 65 74 74 65 72 47 61 72 6d 69 6e 03 57 65 62 10 42 6c 75 65 74 6f 6f 74 68 20 63 6c 69 65 6e 74 01 21 fe',
    )
  })

  it('reproduces the Configuration acknowledgment', () => {
    expect(hex(encodeFrame(MSG.ACK, [0xba, 0x13, 0x00]))).toBe('09 00 88 13 ba 13 00 51 4e')
  })

  it('reproduces the tested host Configuration frame from bits 9, 81, 95, 105', () => {
    expect(hex(hostConfiguration())).toBe('15 00 ba 13 0e 00 02 00 00 00 00 00 00 00 00 02 80 00 02 1e a0')
    expect(readConfigurationBits(configurationPayload(HOST_CONFIG_BITS))).toEqual(HOST_CONFIG_BITS)
  })

  it('validates length and CRC when decoding', () => {
    const frame = hostConfiguration()
    const ok = decodeFrame(frame)
    expect(ok.ok && ok.frame.messageId).toBe(MSG.CONFIGURATION)
    const bad = frame.slice()
    bad[5] ^= 1
    expect(decodeFrame(bad)).toEqual({ ok: false, error: 'CRC mismatch' })
    expect(crc16Arc(fromHex('09 00 88 13 ba 13 00'))).toBe(0x4e51)
  })

  it('round-trips the protobuf transport header', () => {
    const data = Uint8Array.from(findMyWatch())
    const p = protobufPayload({ requestId: 7, offset: 0, total: data.length, data })
    expect(hex(p.slice(0, 14))).toBe('07 00 00 00 00 00 06 00 00 00 06 00 00 00')
    expect(parseProtobufPayload(p)).toEqual({ requestId: 7, offset: 0, total: 6, data })
  })
})

describe('COBS', () => {
  it('round-trips frames containing zeros and long runs', () => {
    const samples = [hostConfiguration(), new Uint8Array(0), Uint8Array.from([0, 0, 0]), Uint8Array.from({ length: 600 }, (_, i) => (i % 7 === 0 ? 0 : i & 0xff || 1))]
    for (const s of samples) {
      const enc = cobsEncode(s)
      expect(enc[0]).toBe(0)
      expect(enc[enc.length - 1]).toBe(0)
      expect(enc.slice(1, -1).includes(0)).toBe(false)
      expect(Array.from(cobsDecode(enc.slice(1, -1)) ?? [])).toEqual(Array.from(s))
    }
  })

  it('reassembles frames split across notifications', () => {
    const a = cobsEncode(hostConfiguration())
    const b = cobsEncode(hostDeviceInformation())
    const stream = new CobsStream()
    const all = new Uint8Array([...a, ...b])
    const frames: Uint8Array[] = []
    for (let o = 0; o < all.length; o += 19) frames.push(...stream.push(all.slice(o, o + 19)))
    expect(frames.map(hex)).toEqual([hex(hostConfiguration()), hex(hostDeviceInformation())])
  })
})

describe('MultiLink', () => {
  it('builds the tested registration request (GFDI service 1, client 1, options 0)', () => {
    expect(hex(registerRequest())).toBe('00 00 01 00 00 00 00 00 00 00 01 00 00')
  })

  it('reads the routing handle from a register response instead of assuming one', () => {
    const resp = fromHex('00 01 01 00 00 00 00 00 00 00 01 00 00 12 00')
    expect(parseRegisterResponse(resp)).toEqual({ clientId: 1, service: 1, status: 0, handle: 18, options: 0 })
  })

  it('fragments into 20-byte writes with the routing byte first', () => {
    const writes = fragment(5, cobsEncode(hostDeviceInformation()))
    expect(writes.every((w) => w.length <= 20 && w[0] === 5)).toBe(true)
  })
})

describe('Smart payloads', () => {
  const cases: [string, number[], string][] = [
    ['LiveSession capabilities', liveSessionCapabilities(), '6a 05 42 03 9a 02 00'],
    ['EventSharing supported alerts', eventSharingSupportedAlerts(), 'f2 01 02 22 00'],
    ['subscribe LiveSession events', subscribeLiveSessionEvents(), 'f2 01 06 0a 04 0a 02 08 13'],
    ['start Strength 10/20', activityCommand('START'), 'c2 03 0b 8a 01 08 0a 04 08 0a 10 14 10 00'],
    ['resume', activityCommand('RESUME'), 'c2 03 05 8a 01 02 10 01'],
    ['pause', activityCommand('PAUSE'), 'c2 03 05 8a 01 02 10 02'],
    ['save', activityCommand('SAVE'), 'c2 03 05 8a 01 02 10 03'],
    ['discard', activityCommand('DISCARD'), 'c2 03 05 8a 01 02 10 04'],
    ['find my watch', findMyWatch(), '62 04 0a 02 08 03'],
    ['cancel find my watch', cancelFindMyWatch(), '62 02 1a 00'],
    ['FileAccess capabilities', fileAccessCapabilities(), '6a 05 42 03 82 01 00'],
    ['start file listing (10)', fileListRequest({ maxReferences: 10 }), 'da 02 04 4a 02 18 0a'],
    ['continue listing (session 1)', fileListRequest({ sessionId: 1 }), 'da 02 04 4a 02 08 01'],
  ]
  for (const [name, bytes, expected] of cases) {
    it(name, () => expect(hex(bytes)).toBe(expected))
  }

  it('decodes nested messages generically', () => {
    const fields = decodeMessage(Uint8Array.from(activityCommand('START')))
    expect(describeProto(fields)).toEqual([{ 56: [{ 17: [{ 1: [{ 1: 10 }, { 2: 20 }] }, { 2: 0 }] }] }])
  })
})
