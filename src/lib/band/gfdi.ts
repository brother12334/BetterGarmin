import { concat, readU16, readU32, u16, u32, pstring } from './bytes'
import { crc16Arc } from './crc'

/** GFDI message IDs used by BetterGarmin. */
export const MSG = {
  ACK: 5000,
  DEVICE_INFORMATION: 5024,
  PROTOBUF_REQUEST: 5043,
  PROTOBUF_RESPONSE: 5044,
  CONFIGURATION: 5050,
} as const

export interface GfdiFrame {
  messageId: number
  payload: Uint8Array
  /** Transaction tag when the band used the compact header (high bit set); replies must echo it. */
  tag: number | null
}

/**
 * length (u16 LE) · message ID (u16 LE) · payload · CRC-16/ARC (u16 LE) over everything before it.
 * With a `tag`, the ID uses the compact form the band used: byte 2 = ID − 5000, byte 3 = 0x80 | tag.
 */
export function encodeFrame(messageId: number, payload: Uint8Array | number[], tag: number | null = null): Uint8Array {
  const length = 2 + 2 + payload.length + 2
  const id = tag == null ? u16(messageId) : [messageId - 5000, 0x80 | (tag & 0x7f)]
  const body = concat(u16(length), id, payload)
  return concat(body, u16(crc16Arc(body)))
}

export type DecodeResult = { ok: true; frame: GfdiFrame } | { ok: false; error: string }

export function decodeFrame(bytes: Uint8Array): DecodeResult {
  if (bytes.length < 6) return { ok: false, error: `frame too short (${bytes.length} bytes)` }
  const length = readU16(bytes, 0)
  if (length !== bytes.length) return { ok: false, error: `length field ${length} ≠ ${bytes.length} bytes` }
  const crc = readU16(bytes, bytes.length - 2)
  if (crc16Arc(bytes, 0, bytes.length - 2) !== crc) return { ok: false, error: 'CRC mismatch' }
  let messageId = readU16(bytes, 2)
  let tag: number | null = null
  // Compact header: high bit set, low byte = offset from 5000, bits 8-14 = transaction tag.
  if (messageId & 0x8000) {
    tag = (messageId >> 8) & 0x7f
    messageId = (messageId & 0xff) + 5000
  }
  return { ok: true, frame: { messageId, payload: bytes.slice(4, bytes.length - 2), tag } }
}

/** Plain acknowledgment: original message ID + status (0 = ACK). */
export function ackPayload(originalId: number, status = 0, extra: number[] = []): Uint8Array {
  return Uint8Array.from([...u16(originalId), status, ...extra])
}

/** Host side of the Device Information exchange, sent as an ACK to the band's 5024 message. */
export function hostDeviceInformation(tag: number | null = null): Uint8Array {
  return encodeFrame(
    MSG.ACK,
    concat(
      ackPayload(MSG.DEVICE_INFORMATION),
      u16(113), // protocol version
      u16(0xffff), // product number
      u32(0xffffffff), // unit number
      u16(1), // software version
      u16(0xffff), // max packet size
      pstring('BetterGarmin'),
      pstring('Web'),
      pstring('Bluetooth client'),
      [1],
    ),
    tag,
  )
}

/** Configuration message: a length-prefixed little-endian capability bitmap. */
export function configurationPayload(bits: number[], byteCount = 14): Uint8Array {
  const map = new Uint8Array(byteCount)
  for (const bit of bits) map[bit >> 3] |= 1 << (bit & 7)
  return concat([byteCount], map)
}

export const HOST_CONFIG_BITS = [9, 81, 95, 105]

export function hostConfiguration(): Uint8Array {
  return encodeFrame(MSG.CONFIGURATION, configurationPayload(HOST_CONFIG_BITS))
}

/** Reads the capability bits a Configuration payload advertises. */
export function readConfigurationBits(payload: Uint8Array): number[] {
  const n = payload[0] ?? 0
  const bits: number[] = []
  for (let i = 0; i < n && i + 1 < payload.length; i++) {
    for (let k = 0; k < 8; k++) if (payload[i + 1] & (1 << k)) bits.push(i * 8 + k)
  }
  return bits
}

/** Protobuf transport header: request ID (u16) · offset (u32) · total length (u32) · fragment length (u32). */
export interface ProtobufChunk {
  requestId: number
  offset: number
  total: number
  data: Uint8Array
}

export function protobufPayload(chunk: ProtobufChunk): Uint8Array {
  return concat(u16(chunk.requestId), u32(chunk.offset), u32(chunk.total), u32(chunk.data.length), chunk.data)
}

export function parseProtobufPayload(payload: Uint8Array): ProtobufChunk | null {
  if (payload.length < 14) return null
  const requestId = readU16(payload, 0)
  const offset = readU32(payload, 2)
  const total = readU32(payload, 6)
  const fragLen = readU32(payload, 10)
  if (14 + fragLen > payload.length) return null
  return { requestId, offset, total, data: payload.slice(14, 14 + fragLen) }
}

/**
 * ACK for an incoming protobuf message: the plain ACK plus request ID, offset, chunk status (0 = kept)
 * and protobuf status (0 = no error).
 */
export function protobufAck(originalId: number, chunk: ProtobufChunk, status = 0, detail = 0, tag: number | null = null): Uint8Array {
  return encodeFrame(MSG.ACK, ackPayload(originalId, 0, [...u16(chunk.requestId), ...u32(chunk.offset), status, detail]), tag)
}

export function parseDeviceInformation(payload: Uint8Array): { protocolVersion: number; name: string | null } {
  const protocolVersion = readU16(payload, 0)
  // protocol(2) product(2) unit(4) software(2) maxPacket(2), then length-prefixed strings.
  let o = 12
  const strings: string[] = []
  while (o < payload.length && strings.length < 3) {
    const len = payload[o++]
    strings.push(new TextDecoder().decode(payload.slice(o, o + len)))
    o += len
  }
  return { protocolVersion, name: strings[0] ?? null }
}

export function readU16Safe(b: Uint8Array, o: number): number {
  return o + 1 < b.length ? readU16(b, o) : -1
}
