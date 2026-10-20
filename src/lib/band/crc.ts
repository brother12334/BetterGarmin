/** CRC-16/ARC (poly 0x8005 reflected = 0xA001, init 0), as used by GFDI frames. */
export function crc16Arc(bytes: Uint8Array, start = 0, end = bytes.length, seed = 0): number {
  let crc = seed
  for (let i = start; i < end; i++) {
    crc ^= bytes[i]
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
  }
  return crc
}
