import { concat, readU16, u16 } from './bytes'

/** Bluetooth UUIDs for the CIRQA's MultiLink GATT service. */
export const BAND_UUIDS = {
  MULTILINK_SERVICE: '6a4e2800-667b-11e3-949a-0800200c9a66',
  NOTIFY: '6a4e2810-667b-11e3-949a-0800200c9a66',
  WRITE: '6a4e2820-667b-11e3-949a-0800200c9a66',
  INFO: '6a4e2803-667b-11e3-949a-0800200c9a66',
  HEART_RATE_SERVICE: '0000180d-0000-1000-8000-00805f9b34fb',
} as const

/** GFDI's MultiLink service code. */
export const GFDI_SERVICE = 1
/** A registration identifier, not a secret. */
export const CLIENT_ID = 1
/** Conservative write budget that worked on the tested phone: 1 routing byte + 19 stream bytes. */
export const WRITE_BUDGET = 20

const REGISTER_REQUEST = 0
const REGISTER_RESPONSE = 1

/** Management message (handle 0): register service `service` for client `clientId` with `options`. */
export function registerRequest(service = GFDI_SERVICE, clientId = CLIENT_ID, options = 0): Uint8Array {
  const id = new Uint8Array(8)
  new DataView(id.buffer).setBigUint64(0, BigInt(clientId), true)
  return concat([0, REGISTER_REQUEST], id, u16(service), [options])
}

export interface RegisterResponse {
  service: number
  clientId: number
  status: number
  handle: number
  options: number
}

/** Parses a handle-0 register response: type · client ID (u64) · service (u16) · status · assigned handle · options. */
export function parseRegisterResponse(bytes: Uint8Array): RegisterResponse | null {
  if (bytes.length < 14 || bytes[0] !== 0 || bytes[1] !== REGISTER_RESPONSE) return null
  const clientId = Number(new DataView(bytes.buffer, bytes.byteOffset + 2, 8).getBigUint64(0, true))
  return { clientId, service: readU16(bytes, 10), status: bytes[12], handle: bytes[13], options: bytes[14] ?? 0 }
}

/** Splits an encoded GFDI stream into Bluetooth writes, each prefixed with the routing handle. */
export function fragment(handle: number, stream: Uint8Array, budget = WRITE_BUDGET): Uint8Array[] {
  const per = budget - 1
  const out: Uint8Array[] = []
  for (let o = 0; o < stream.length; o += per) out.push(concat([handle], stream.slice(o, o + per)))
  return out
}

/** File-pipe services the Android app uses for reliable downloads. */
export const FILE_PIPE_SERVICES = [0x2018, 0x4018, 0x6018, 0x8018, 0xa018, 0xc018, 0xe018] as const
/** Registration option requesting a reliable channel. */
export const OPTION_RELIABLE = 2

const CLOSE_HANDLE_REQUEST = 2
const CLOSE_HANDLE_RESPONSE = 3

/**
 * Close one registered service: type 2 · client ID (u64) · service (u16) · handle.
 * Layout follows Gadgetbridge's MultiLink implementation; not yet exercised on a CIRQA.
 */
export function closeHandleRequest(service: number, handle: number, clientId = CLIENT_ID): Uint8Array {
  const id = new Uint8Array(8)
  new DataView(id.buffer).setBigUint64(0, BigInt(clientId), true)
  return concat([0, CLOSE_HANDLE_REQUEST], id, u16(service), [handle])
}

export function isCloseHandleResponse(bytes: Uint8Array): { service: number; handle: number; status: number } | null {
  if (bytes.length < 14 || bytes[0] !== 0 || bytes[1] !== CLOSE_HANDLE_RESPONSE) return null
  return { service: readU16(bytes, 10), handle: bytes[12], status: bytes[13] ?? 0 }
}
