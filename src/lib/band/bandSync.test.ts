import { afterEach, describe, expect, it } from 'vitest'
import { Encoder, Profile } from '@garmin/fitsdk'
import { hex } from './bytes'
import { FakeBand } from './fakeBand.testutil'
import { MSG, encodeFrame, protobufPayload } from './gfdi'
import { decodeMessage, lfield, vfield } from './proto'
import { BandSession } from './session'
import { ReliableChannel } from './reliable'
import { memoryBandStore } from './bandFileStore'
import { syncBand } from './bandSync'
import { incrementalFileList, pullItemDataRequest } from './smart'
import { registerRequest } from './multilink'

/** A real FIT activity file built with Garmin's SDK: a 40-minute strength session with heart rate. */
function strengthFit(): Uint8Array {
  // The SDK's Mesg type is a loose record; cast the literals instead of fighting its typing.
  const e = new Encoder() as unknown as { onMesg(n: number, m: Record<string, unknown>): void; close(): Uint8Array }
  const start = new Date('2026-10-18T23:51:00Z')
  e.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'garmin', product: 0, timeCreated: start, type: 'activity' })
  for (let i = 0; i < 240; i++) e.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(start.getTime() + i * 10_000), heartRate: 95 + ((i * 7) % 60) })
  e.onMesg(Profile.MesgNum.SESSION, {
    timestamp: start,
    startTime: start,
    totalElapsedTime: 2400,
    totalTimerTime: 2380,
    sport: 'training',
    subSport: 'strengthTraining',
    totalCalories: 312,
    avgHeartRate: 124,
    maxHeartRate: 154,
    totalTrainingEffect: 2.9,
  })
  return e.close()
}

const MS = Uint8Array.from([0xa3, 0x48, 0xc4, 0xb0, 0x74, 0x08, 0x1f, 0x6e])
const LS = Uint8Array.from([0x62, 0xf7, 0xe3, 0xed, 0xf1, 0x58, 0x8d, 0x8c])
const MS2 = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])
const LS2 = Uint8Array.from([9, 10, 11, 12, 13, 14, 15, 16])

const item = (ms: Uint8Array, ls: Uint8Array, size: number, typeKey: number, typeName?: string) => [
  ...lfield(1, [0x09, ...ms, 0x11, ...ls]),
  ...lfield(2, [...vfield(1, 0), ...(typeName ? lfield(2, new TextEncoder().encode(typeName)) : []), ...vfield(3, typeKey)]),
  ...vfield(3, size),
]

interface Scenario {
  files: { ms: Uint8Array; ls: Uint8Array; bytes: Uint8Array }[]
  dropEvery?: number
  disconnectAfterPackets?: number
  /** The band answers the first N pulls with NO_AVAILABLE_RESOURCES. */
  refusePulls?: number
}

/** Installs a fake band that serves `files` over the simulated reliable pipe. */
function serve(fake: FakeBand, session: () => BandSession, sc: Scenario) {
  fake.configBits = [9, 58, 81, 90, 95, 105]
  const reply = (requestId: number, smart: number[]) =>
    fake.sendFrame(encodeFrame(MSG.PROTOBUF_RESPONSE, protobufPayload({ requestId, offset: 0, total: smart.length, data: Uint8Array.from(smart) })))
  let current: Uint8Array | null = null
  let bandSide: ReliableChannel | null = null
  let packetsOut = 0
  const pulls: string[] = []
  fake.onRegister = (service, options) => {
    if (options !== 2) return [1, 0]
    bandSide = new ReliableChannel({
      handle: 0x80,
      revision: 0,
      write: (p) => {
        packetsOut++
        if (sc.disconnectAfterPackets && packetsOut === sc.disconnectAfterPackets) {
          setTimeout(() => session().disconnect(), 0)
          return
        }
        if (sc.dropEvery && packetsOut % sc.dropEvery === 0) return
        setTimeout(() => fake.notify(p), 1)
      },
      onData: (payload) => {
        // Configure request: 00 00 <handle u32>. Reply OK, then stream the file.
        if (payload[0] === 0 && payload[1] === 0 && payload.length === 6 && current) {
          const file = current
          void bandSide!.send(Uint8Array.from([0, 0, 0]))
          void bandSide!.send(file)
        }
      },
    })
    void service
    return [0, 0x80]
  }
  fake.onReliable = (p) => setTimeout(() => bandSide?.receive(p), 1)
  fake.onProtobuf = (requestId, data) => {
    const top = decodeMessage(data)![0]
    const inner = decodeMessage(top.value as Uint8Array)![0]
    if (top.field === 13) return reply(requestId, lfield(13, lfield(9, lfield(16, vfield(1, 1)))))
    if (top.field === 43 && inner.field === 9) {
      const items = sc.files.map((f, i) => lfield(4, item(f.ms, f.ls, f.bytes.length, 7, i === 0 ? 'FIT_TYPE_4' : undefined))).flat()
      return reply(requestId, lfield(43, lfield(10, [...vfield(1, 0), ...vfield(3, 98), ...items])))
    }
    if (top.field === 43 && inner.field === 1) {
      const req = decodeMessage(inner.value as Uint8Array)!
      const uid = decodeMessage(decodeMessage(req[0].value as Uint8Array)![0].value as Uint8Array)!
      const ms = uid[0].value as Uint8Array
      const f = sc.files.find((x) => hex(x.ms) === hex(ms))
      pulls.push(hex(ms))
      if (!f) return reply(requestId, lfield(43, lfield(2, vfield(1, 8))))
      if (sc.refusePulls && pulls.length <= sc.refusePulls) return reply(requestId, lfield(43, lfield(2, vfield(1, 3))))
      current = f.bytes
      return reply(requestId, lfield(43, lfield(2, [...vfield(1, 0), ...vfield(2, 0), ...vfield(3, 0x12345678)])))
    }
  }
  return { pulls, closes: fake.closes }
}

let session: BandSession
afterEach(() => {
  session?.disconnect()
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
})

async function connected(sc: Scenario) {
  const fake = new FakeBand()
  session = new BandSession()
  const env = serve(fake, () => session, sc)
  fake.install()
  await session.connect()
  return { fake, ...env }
}

describe('wire builders for the download path', () => {
  it('reliable file-pipe registration and incremental listing match the protocol packet', () => {
    expect(hex(registerRequest(0x2018, 1, 2))).toBe('00 00 01 00 00 00 00 00 00 00 18 20 02')
    expect(hex(incrementalFileList(98))).toBe('da 02 04 4a 02 10 62')
  })
  it('pull request carries the exact UUID halves, priority 30, pipe transport and offset 0', () => {
    expect(hex(pullItemDataRequest({ ms: new Uint8Array(8), ls: new Uint8Array(8) }))).toBe(
      'da 02 1e 0a 1c 0a 14 0a 12 09 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 10 1e 18 00 20 00',
    )
  })
})

describe('direct sync against a simulated band', () => {
  it('downloads a real FIT activity, validates it, imports it, closes the pipe, and skips it on the next sync', async () => {
    const fit = strengthFit()
    const { closes } = await connected({ files: [{ ms: MS, ls: LS, bytes: fit }] })
    const store = memoryBandStore()
    const first = await syncBand(session, store)
    expect(first.outcomes.map((o) => o.result)).toEqual(['imported'])
    const rec = [...store.records.values()][0]
    expect(rec.uidHex).toBe('a348c4b074081f6e62f7e3edf1588d8c')
    expect(rec.size).toBe(fit.length)
    expect(rec.activity).toMatchObject({ sport: 'training', subSport: 'strengthTraining', calories: 312, avgHr: 124, maxHr: 154, elapsed: 2400 })
    expect(rec.activity?.hr.length).toBe(240)
    expect(closes).toEqual([{ service: 0x2018, handle: 0x80 }])
    expect(first.nextTransactionId).toBe(98)

    // The band is released after every sync, so the next sync connects again.
    expect(session.state).toBe('disconnected')
    await connected({ files: [{ ms: MS, ls: LS, bytes: fit }] })
    const second = await syncBand(session, store)
    expect(second.outcomes.map((o) => o.result)).toEqual(['skipped-duplicate'])
    expect(store.records.size).toBe(1)
  }, 30_000)

  it('retries a refused download within the same sync and adds the workout to history', async () => {
    const fit = strengthFit()
    const { pulls } = await connected({ files: [{ ms: MS, ls: LS, bytes: fit }], refusePulls: 1 })
    const store = memoryBandStore()
    const r = await syncBand(session, store)
    expect(r.outcomes[0].result).toBe('imported')
    expect(pulls.length).toBe(2)
    expect([...store.entries.keys()]).toEqual([...store.records.keys()])
  }, 30_000)

  it('survives packet loss on a multi-wrap transfer', async () => {
    const fit = strengthFit()
    await connected({ files: [{ ms: MS, ls: LS, bytes: fit }], dropEvery: 9 })
    const store = memoryBandStore()
    const r = await syncBand(session, store)
    expect(r.outcomes[0]).toMatchObject({ result: 'imported' })
    expect(store.records.size).toBe(1)
  }, 60_000)

  it('saves nothing when the band disconnects mid-transfer, then completes on reconnect', async () => {
    const fit = strengthFit()
    await connected({ files: [{ ms: MS, ls: LS, bytes: fit }], disconnectAfterPackets: 20 })
    const store = memoryBandStore()
    const broken = await syncBand(session, store)
    expect(broken.outcomes[0].result).toBe('failed')
    expect(store.records.size).toBe(0)

    await connected({ files: [{ ms: MS, ls: LS, bytes: fit }] })
    const retry = await syncBand(session, store)
    expect(retry.outcomes[0].result).toBe('imported')
  }, 30_000)

  it('rejects a corrupted file and imports nothing from it', async () => {
    const bad = strengthFit()
    bad[40] ^= 0xff
    await connected({ files: [{ ms: MS2, ls: LS2, bytes: bad }] })
    const store = memoryBandStore()
    const r = await syncBand(session, store)
    expect(r.outcomes[0]).toMatchObject({ result: 'failed' })
    expect(r.outcomes[0].error).toMatch(/integrity/i)
    expect(store.records.size).toBe(0)
  }, 30_000)

  it('remembers a valid non-FIT file without importing anything from it', async () => {
    await connected({ files: [{ ms: MS2, ls: LS2, bytes: new TextEncoder().encode('<settings/>') }] })
    const store = memoryBandStore()
    const r = await syncBand(session, store)
    expect(r.outcomes[0].result).toBe('unsupported')
    expect([...store.records.values()][0].activity).toBeNull()
  }, 30_000)
})
