import { afterEach, describe, expect, it } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { FakeBand } from './fakeBand.testutil'
import { MSG, encodeFrame } from './gfdi'
import { u16, u32, readU16, readU32 } from './bytes'
import { BandSession } from './session'
import { memoryBandStore } from './bandFileStore'
import { syncLegacyWellness } from './bandSync'
import { chunkCrc, parseDirectory } from './legacyFiles'
import { decodeWellness } from './wellness'

const FIT_EPOCH_S = 631065600

function monitoringFit(): Uint8Array {
  const e = new Encoder() as unknown as { onMesg(n: number, m: Record<string, unknown>): void; close(): Uint8Array }
  const start = new Date('2026-10-19T22:00:00Z')
  e.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 0, timeCreated: start, type: 'monitoringB' })
  for (let i = 0; i < 30; i++) e.onMesg(Profile.MesgNum.STRESS_LEVEL, { stressLevelValue: 20 + i, stressLevelTime: new Date(start.getTime() + i * 180_000) })
  for (let i = 0; i < 120; i++) e.onMesg(Profile.MesgNum.SLEEP_LEVEL, { timestamp: new Date(start.getTime() + i * 60_000), sleepLevel: i < 60 ? 'light' : 'deep' })
  return e.close()
}

function directory(entries: { index: number; subType: number; size: number; at: Date }[]): Uint8Array {
  const out: number[] = []
  for (const e of entries) out.push(...u16(e.index), 128, e.subType, ...u16(1), 0, 0, ...u32(e.size), ...u32(Math.floor(e.at.getTime() / 1000) - FIT_EPOCH_S))
  return Uint8Array.from(out)
}

/** Serves files over 5002/5004 in 100-byte chunks with the running CRC, honouring the host's next-offset acks. */
function serveLegacy(fake: FakeBand, files: Map<number, Uint8Array>, opts: { corruptFirstChunkOnce?: boolean } = {}) {
  let current: { bytes: Uint8Array; crc: number } | null = null
  let corrupt = opts.corruptFirstChunkOnce
  const sendFrom = (offset: number) => {
    if (!current || offset >= current.bytes.length) return
    const data = current.bytes.slice(offset, offset + 100)
    const crc = chunkCrc(data, current.crc)
    const sentCrc = corrupt ? crc ^ 0xffff : crc
    corrupt = false
    setTimeout(() => fake.sendFrame(encodeFrame(5004, [0, ...u16(sentCrc), ...u32(offset), ...data])), 1)
  }
  let crcAt = new Map<number, number>()
  fake.onFrame = (id, payload) => {
    if (id === 5007) return fake.sendFrame(encodeFrame(MSG.ACK, [...u16(5007), 0]))
    if (id === 5002) {
      const index = readU16(payload, 0)
      const bytes = files.get(index)
      if (!bytes) return fake.sendFrame(encodeFrame(MSG.ACK, [...u16(5002), 0, 1, ...u32(0)]))
      current = { bytes, crc: 0 }
      crcAt = new Map([[0, 0]])
      fake.sendFrame(encodeFrame(MSG.ACK, [...u16(5002), 0, 0, ...u32(bytes.length)]))
      sendFrom(0)
    } else if (id === MSG.ACK && readU16(payload, 0) === 5004 && current) {
      const status = payload[3]
      const next = readU32(payload, 4)
      if (status === 0) {
        // Remember the CRC at the acknowledged offset, then continue.
        const prevOffset = [...crcAt.keys()].filter((k) => k < next).pop() ?? 0
        crcAt.set(next, chunkCrc(current.bytes.slice(prevOffset, next), crcAt.get(prevOffset)!))
      }
      current.crc = crcAt.get(next) ?? 0
      sendFrom(next)
    }
  }
}

let session: BandSession
afterEach(() => {
  session?.disconnect()
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
})

async function connected(files: Map<number, Uint8Array>, opts?: { corruptFirstChunkOnce?: boolean }) {
  const fake = new FakeBand()
  fake.configBits = [9, 58, 81, 90, 95, 105]
  session = new BandSession()
  serveLegacy(fake, files, opts)
  fake.install()
  await session.connect()
  return fake
}

describe('older GFDI file transfer for all-day files', () => {
  it('parses a directory entry', () => {
    const d = parseDirectory(directory([{ index: 7, subType: 49, size: 1234, at: new Date('2026-10-20T06:00:00Z') }]))
    expect(d[0]).toMatchObject({ fileIndex: 7, dataType: 128, subType: 49, size: 1234 })
  })

  it('downloads the directory and a sleep/stress file chunk by chunk, checks the CRC, stores it, and skips it next time', async () => {
    const fit = monitoringFit()
    const files = new Map([
      [0, directory([{ index: 5, subType: 32, size: fit.length, at: new Date('2026-10-20T06:00:00Z') }, { index: 6, subType: 4, size: 999, at: new Date() }])],
      [5, fit],
    ])
    await connected(files, { corruptFirstChunkOnce: true })
    const store = memoryBandStore()
    const out = await syncLegacyWellness(session, store, 'fake')
    expect(out.map((o) => o.result)).toEqual(['unsupported'])
    const rec = [...store.records.values()][0]
    expect(rec.bytes).toEqual(fit)
    const w = decodeWellness(rec.bytes)!
    expect(w.stress.length).toBe(30)
    expect(w.sleepLevels.length).toBe(120)
    const again = await syncLegacyWellness(session, store, 'fake')
    expect(again.map((o) => o.result)).toEqual(['skipped-duplicate'])
  }, 30_000)

  it('skips quietly when the band refuses the older transfer', async () => {
    await connected(new Map())
    expect(await syncLegacyWellness(session, memoryBandStore(), 'fake')).toEqual([])
  }, 30_000)
})
