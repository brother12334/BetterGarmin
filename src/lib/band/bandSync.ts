import type { BandSession } from './session'
import { ReliableChannel } from './reliable'
import { FILE_PIPE_SERVICES, OPTION_RELIABLE } from './multilink'
import { decodeFileListPage, decodePullResponse, type FileItem } from './files'
import { fileAccessCapabilities, fileListRequest, pullItemDataRequest } from './smart'
import { validateAndDecodeFit } from './fitImport'
import type { BandFileStore } from './bandFileStore'

/**
 * Direct band → BetterGarmin sync over Bluetooth (experimental):
 * list files → for each new file: register a reliable file pipe → PullItemDataRequest → configure the read pipe →
 * receive ordered bytes → close the pipe → validate size and FIT integrity → save → only then count it as synced.
 * Nothing on the band is deleted, archived or flagged.
 */

const FILE_ACCESS_CAPABILITY = 90
const IDLE_TIMEOUT_MS = 20_000
const MAX_FILE_BYTES = 8 * 1024 * 1024

export interface SyncProgress {
  phase: 'listing' | 'downloading' | 'done'
  current?: { index: number; total: number; dataType: string | null; received: number; size: number }
}

export interface FileOutcome {
  uidHex: string | null
  dataType: string | null
  result: 'imported' | 'unsupported' | 'skipped-duplicate' | 'failed'
  error?: string
}

export interface SyncReport {
  listed: number
  outcomes: FileOutcome[]
  nextTransactionId: number | null
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`No answer from the band (${what})`)), ms))])
}

async function listAll(session: BandSession): Promise<{ items: FileItem[]; nextTransactionId: number | null }> {
  const items: FileItem[] = []
  let sessionId: number | null = null
  let nextTransactionId: number | null = null
  const seen = new Set<number>()
  for (let page = 0; page < 20; page++) {
    const req = session.sendSmart(fileListRequest(sessionId == null ? { maxReferences: 10 } : { sessionId }), 'FileAccess list')
    const p = decodeFileListPage((await withTimeout(req.response, 15_000, 'file list')).fields)
    items.push(...p.items)
    nextTransactionId = p.nextTransactionId
    if (p.complete || p.sessionId == null) break
    if (seen.has(p.sessionId) && p.items.length === 0) throw new Error('The file listing stopped making progress')
    seen.add(p.sessionId)
    sessionId = p.sessionId
  }
  return { items, nextTransactionId }
}

/** Downloads one file's bytes over a fresh reliable pipe. Always closes the pipe, whatever happens. */
export async function downloadFile(session: BandSession, item: FileItem, onBytes: (received: number) => void = () => {}): Promise<Uint8Array> {
  if (!item.uid) throw new Error('This file has no UUID; it is never guessed')
  const size = item.dataSize != null ? Number(item.dataSize) : null
  if (size != null && size > MAX_FILE_BYTES) throw new Error(`File too large (${size} bytes)`)

  // 1. A reliable file pipe must be ready before the pull is negotiated.
  let service = 0
  let handle = 0
  for (const candidate of FILE_PIPE_SERVICES) {
    const resp = await session.registerService(candidate, OPTION_RELIABLE)
    if (resp.status === 0) {
      service = candidate
      handle = resp.handle
      if (!(handle & 0x80)) {
        await session.closeService(service, handle)
        throw new Error(`The band registered the file pipe without a reliable handle (0x${handle.toString(16)})`)
      }
      break
    }
  }
  if (!service) throw new Error('The band has no free file pipe')

  const chunks: Uint8Array[] = []
  let received = 0
  let configured: boolean | null = null
  let failure: Error | null = null
  let wake: () => void = () => {}
  const changed = () => wake()

  const channel = new ReliableChannel({
    handle,
    // The register response doesn't report a revision; 0 (64-sequence space) is the native default. Unverified on hardware.
    revision: 0,
    write: (p) => session.writeReliable(p),
    onData: (payload) => {
      if (configured === null) {
        // First application reply: command 0, general status, configure status.
        if (payload.length < 3 || payload[0] !== 0) failure = new Error('Malformed pipe configure reply')
        else if (payload[1] !== 0) failure = new Error(`Pipe rejected the command (status ${payload[1]})`)
        else if (payload[2] !== 0) failure = new Error(['', 'Unknown transfer handle', 'Unexpected direction', 'Unexpected size'][payload[2]] ?? `Configure failed (${payload[2]})`)
        configured = failure == null
        if (configured && payload.length > 3) {
          chunks.push(payload.slice(3))
          received += payload.length - 3
        }
      } else {
        chunks.push(payload)
        received += payload.length
      }
      onBytes(received)
      changed()
    },
    onClose: (e) => {
      if (e) failure ??= e
      changed()
    },
  })
  const unroute = session.onReliable(handle, (p) => channel.receive(p))
  const undisconnect = session.onDisconnect(() => {
    failure ??= new Error('The band disconnected during the download')
    changed()
  })

  try {
    // 2. Negotiate the pull (fresh, uncompressed).
    const pull = decodePullResponse((await withTimeout(session.sendSmart(pullItemDataRequest(item.uid), 'FileAccess pull').response, 15_000, 'pull')).fields)
    if (pull.compressionWindow) throw new Error('The band chose a compressed transfer, which BetterGarmin does not support yet')

    // 3. Configure the read pipe: 00 00 <transfer handle u32 LE>.
    const config = new Uint8Array(6)
    new DataView(config.buffer).setUint32(2, pull.transferHandle, true)
    await withTimeout(channel.send(config), 30_000, 'pipe configuration')

    // 4. Receive until the listed size arrives, failing on errors or inactivity.
    while (true) {
      if (failure) throw failure
      if (size != null && received >= size) break
      const before = received
      await new Promise<void>((resolve) => {
        wake = resolve
        setTimeout(resolve, IDLE_TIMEOUT_MS)
      })
      if (failure) throw failure
      if (received === before && !(size != null && received >= size)) throw new Error('The transfer stalled')
    }
    const out = new Uint8Array(received)
    let o = 0
    for (const c of chunks) {
      out.set(c, o)
      o += c.length
    }
    if (size != null && out.length !== size) throw new Error(`Received ${out.length} bytes, expected ${size}`)
    return out
  } finally {
    channel.close()
    unroute()
    undisconnect()
    await session.closeService(service, handle).catch(() => false)
  }
}

/** Lists the band's files and imports every one not already synced. Each file is saved before it counts as done. */
export async function syncBand(session: BandSession, store: BandFileStore, onProgress: (p: SyncProgress) => void = () => {}): Promise<SyncReport> {
  if (session.state !== 'ready') throw new Error('Connect the band first')
  if (!session.bandConfigBits.includes(FILE_ACCESS_CAPABILITY)) throw new Error("The band doesn't advertise FileAccess (capability 90)")
  onProgress({ phase: 'listing' })
  await withTimeout(session.sendSmart(fileAccessCapabilities(), 'FileAccess capabilities').response, 15_000, 'capabilities')
  const { items, nextTransactionId } = await listAll(session)
  const deviceKey = session.deviceId ?? session.deviceName ?? 'band'
  const outcomes: FileOutcome[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const base = { uidHex: item.uidHex, dataType: item.dataType }
    if (!item.uidHex) {
      outcomes.push({ ...base, result: 'failed', error: 'No UUID in listing' })
      continue
    }
    const key = `${deviceKey}:${item.uidHex}`
    if (await store.has(key)) {
      outcomes.push({ ...base, result: 'skipped-duplicate' })
      continue
    }
    const size = item.dataSize != null ? Number(item.dataSize) : 0
    try {
      onProgress({ phase: 'downloading', current: { index: i, total: items.length, dataType: item.dataType, received: 0, size } })
      const bytes = await downloadFile(session, item, (received) =>
        onProgress({ phase: 'downloading', current: { index: i, total: items.length, dataType: item.dataType, received, size } }),
      )
      const fit = validateAndDecodeFit(bytes, item.dataSize != null ? Number(item.dataSize) : null)
      // A complete download that isn't FIT at all (settings, logs) is remembered so it isn't fetched again, but nothing is
      // imported from it. A FIT file that fails its size or CRC check is an error and is retried next time.
      const notFit = !fit.ok && fit.error.startsWith('Not a FIT file')
      if (!fit.ok && !notFit) throw new Error(fit.error)
      const status = fit.ok && fit.activity ? 'imported' : 'unsupported'
      await store.put({
        key,
        deviceKey,
        uidHex: item.uidHex,
        dataType: item.dataType,
        size: bytes.length,
        modifiedTime: item.modifiedTime,
        syncedAt: Date.now(),
        status,
        fileType: fit.ok ? fit.fileType : null,
        activity: fit.ok ? fit.activity : null,
        bytes,
      })
      outcomes.push({ ...base, result: status })
    } catch (e) {
      outcomes.push({ ...base, result: 'failed', error: e instanceof Error ? e.message : String(e) })
      if (session.state !== 'ready') break // disconnected: stop; the next sync resumes with what's left
    }
  }
  onProgress({ phase: 'done' })
  return { listed: items.length, outcomes, nextTransactionId }
}
