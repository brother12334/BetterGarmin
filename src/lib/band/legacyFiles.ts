import { readU16, readU32, u16, u32 } from './bytes'
import { crc16Arc } from './crc'

/**
 * Garmin's older GFDI file transfer (as used by Gadgetbridge): the band keeps a directory file at index 0 listing
 * every file with a data type and subtype, and files are pulled with DownloadRequest (5002) and arrive as
 * FileTransferData (5004) chunks, each acknowledged with the next expected offset.
 *
 * The CIRQA's device file lists Monitor, Sleep, HRVStatus, HSA and SkinTemp directories that its newer FileAccess
 * listing never returned, which is why this path is tried. Message layouts follow Gadgetbridge; unverified on a CIRQA.
 */

export const LEGACY_MSG = { DOWNLOAD_REQUEST: 5002, FILE_TRANSFER_DATA: 5004, FILTER: 5007, SYSTEM_EVENT: 5030, SYNCHRONIZATION: 5037 } as const

/** System event "sync ready" (Gadgetbridge's GarminSystemEventType ordinal 8), value 0. */
export const SYNC_READY_PAYLOAD = [8, 0]

/** Synchronization (5037) from the band: type (0 manual, 1 automatic) and a bitmask of file kinds with data waiting. */
export function parseSynchronization(payload: Uint8Array): { type: number; bitmask: bigint } | null {
  if (payload.length < 2) return null
  const size = payload[1]
  if (payload.length < 2 + size) return null
  let mask = 0n
  for (let i = size - 1; i >= 0; i--) mask = (mask << 8n) | BigInt(payload[2 + i])
  return { type: payload[0], bitmask: mask }
}

/** Directory filter sent before reading the directory (Gadgetbridge's FilterType): 0 = all files, 3 = only new. */
export const FILTER = { ALL_FILES: 0, ONLY_NEW: 3 } as const

/** FIT file subtypes worth downloading for all-day data. */
export const WELLNESS_SUBTYPES: Record<number, string> = {
  32: 'monitoring',
  44: 'metrics',
  49: 'sleep',
  68: 'hrv status',
  70: 'health snapshot',
  73: 'skin temperature',
  79: 'sleep disruption',
}

export interface DirectoryEntry {
  fileIndex: number
  dataType: number
  subType: number
  fileNumber: number
  specificFlags: number
  fileFlags: number
  size: number
  /** Garmin epoch seconds (FIT time). */
  fitTime: number
}

const FIT_EPOCH_S = 631065600
export const entryDate = (e: DirectoryEntry) => new Date((e.fitTime + FIT_EPOCH_S) * 1000)

/** DownloadRequest payload: file index, offset, request type (1 = new transfer), CRC seed, data size (0 = whole file), flags. */
export function downloadRequestPayload(fileIndex: number, offset = 0, crcSeed = 0): number[] {
  return [...u16(fileIndex), ...u32(offset), offset === 0 ? 1 : 0, ...u16(crcSeed), ...u32(0), 0]
}

/** One line per directory entry for the protocol log: identifiers, sizes and dates only. */
export function describeEntry(e: DirectoryEntry): string {
  return `#${e.fileIndex} type ${e.dataType}/${e.subType}${WELLNESS_SUBTYPES[e.subType] && e.dataType === 128 ? ` (${WELLNESS_SUBTYPES[e.subType]})` : ''} ${e.size}B flags 0x${e.fileFlags.toString(16)} ${entryDate(e).toISOString().slice(0, 16)}`
}

/** The band's answer to a DownloadRequest, carried in its ACK after the plain status byte. */
export function parseDownloadStatus(ackPayload: Uint8Array): { status: number; downloadStatus: number; size: number } | null {
  if (ackPayload.length < 3) return null
  return { status: ackPayload[2], downloadStatus: ackPayload[3] ?? 255, size: ackPayload.length >= 8 ? readU32(ackPayload, 4) : 0 }
}

export const DOWNLOAD_STATUS = ['OK', 'index unknown', 'index not readable', 'no space left', 'invalid', 'not ready', 'CRC incorrect']

export interface TransferChunk {
  flags: number
  crc: number
  offset: number
  data: Uint8Array
}

export function parseTransferData(payload: Uint8Array): TransferChunk | null {
  if (payload.length < 7) return null
  return { flags: payload[0], crc: readU16(payload, 1), offset: readU32(payload, 3), data: payload.slice(7) }
}

/** Chunk CRC is the running CRC-16 of the whole file so far, seeded with the previous chunk's CRC. */
export const chunkCrc = (data: Uint8Array, seed: number) => crc16Arc(data, 0, data.length, seed)

/** Host reply to a chunk: transfer status (0 OK, 3 CRC mismatch, 4 offset mismatch) and the next offset wanted. */
export const transferAckExtra = (status: number, nextOffset: number) => [status, ...u32(nextOffset)]

export function parseDirectory(bytes: Uint8Array): DirectoryEntry[] {
  const out: DirectoryEntry[] = []
  for (let o = 0; o + 16 <= bytes.length; o += 16) {
    out.push({
      fileIndex: readU16(bytes, o),
      dataType: bytes[o + 2],
      subType: bytes[o + 3],
      fileNumber: readU16(bytes, o + 4),
      specificFlags: bytes[o + 6],
      fileFlags: bytes[o + 7],
      size: readU32(bytes, o + 8),
      fitTime: readU32(bytes, o + 12),
    })
  }
  return out
}

/** Wellness FIT files from the directory, newest first. */
export function wellnessEntries(dir: DirectoryEntry[]): DirectoryEntry[] {
  return dir.filter((e) => e.dataType === 128 && e.subType in WELLNESS_SUBTYPES && e.size > 0).sort((a, b) => b.fitTime - a.fitTime)
}
