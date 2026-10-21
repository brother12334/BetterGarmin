import type { BandSession } from './session'
import { ReliableChannel } from './reliable'
import { FILE_PIPE_SERVICES, OPTION_RELIABLE } from './multilink'
import { decodeFileListPage, decodePullResponse, type FileItem } from './files'
import { fileAccessCapabilities, fileListRequest, pullItemDataRequest } from './smart'
import { validateAndDecodeFit } from './fitImport'
import type { BandFileStore } from './bandFileStore'
import { markBandSynced, recordAttempt, recordSeen } from './bandIndex'
import { FILTER, WELLNESS_SUBTYPES, describeEntry, entryDate, parseDirectory, wellnessEntries } from './legacyFiles'

/** Newest all-day files fetched per sync over the older transfer (each is small, but the link is slow). */
const MAX_LEGACY_FILES = 40
export const LEGACY_TRANSFER_ENABLED = false

/**
 * Direct band → BetterGarmin sync over Bluetooth (experimental):
 * list files → for each new file: register a reliable file pipe → PullItemDataRequest → configure the read pipe →
 * receive ordered bytes → close the pipe → validate size and FIT integrity → save → only then count it as synced.
 * Nothing on the band is deleted, archived or flagged.
 */

const FILE_ACCESS_CAPABILITY = 90
const IDLE_TIMEOUT_MS = 20_000
/** Download attempts per file in one sync, while the band stays connected. */
const MAX_ATTEMPTS = 3
/** Failures that won't change on a retry. */
const permanent = (msg: string) => /compressed|too large|no UUID|not support/i.test(msg)
const MAX_FILE_BYTES = 8 * 1024 * 1024

export interface SyncProgress {
  phase: 'listing' | 'downloading' | 'done'
  current?: { index: number; total: number; dataType: string | null; received: number; size: number; attempt: number }
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
  recordSeen(
    items
      .filter((i) => i.uidHex)
      .map((i) => ({ key: `${deviceKey}:${i.uidHex}`, uidHex: i.uidHex!, dataType: i.dataType, size: i.dataSize != null ? Number(i.dataSize) : null, modifiedTime: i.modifiedTime })),
  )
  // Files downloaded by an earlier version, before workouts had history entries.
  for (const r of await store.all()) if (r.activity) await store.addHistory(r.key)

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
      let bytes: Uint8Array | null = null
      for (let attempt = 1; !bytes; attempt++) {
        onProgress({ phase: 'downloading', current: { index: i, total: items.length, dataType: item.dataType, received: 0, size, attempt } })
        try {
          bytes = await downloadFile(session, item, (received) =>
            onProgress({ phase: 'downloading', current: { index: i, total: items.length, dataType: item.dataType, received, size, attempt } }),
          )
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (attempt >= MAX_ATTEMPTS || session.state !== 'ready' || permanent(msg)) throw e
          session.addLog('info', `retrying file ${i + 1} (attempt ${attempt + 1}): ${msg}`)
        }
      }
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
      // Saved first, then it joins the history: a workout is never "in history" without its original file.
      if (status === 'imported') await store.addHistory(key)
      recordAttempt(key, null)
      outcomes.push({ ...base, result: status })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      recordAttempt(key, error)
      outcomes.push({ ...base, result: 'failed', error })
      if (session.state !== 'ready') break // disconnected: stop; the next sync resumes with what's left
    }
  }
  // All-day files (monitoring, sleep, HRV…) only show up in the band's directory file, read over the older transfer.
  // Off: on a real CIRQA its directory came back empty every time, and these extra commands (sync ready, filter,
  // directory read) began around when the band stopped handing all-day data to any app. Kept for research only.
  if (LEGACY_TRANSFER_ENABLED && session.state === 'ready') outcomes.push(...(await syncLegacyWellness(session, store, deviceKey, onProgress)))

  if (!outcomes.some((o) => o.result === 'failed')) markBandSynced()
  onProgress({ phase: 'done' })
  return { listed: items.length, outcomes, nextTransactionId }
}

/**
 * Reads the band's file directory (index 0) over the older GFDI transfer and downloads new all-day files. Failures here
 * never fail the rest of the sync: if the band doesn't support this path, it's noted in the log and skipped.
 */
export async function syncLegacyWellness(session: BandSession, store: BandFileStore, deviceKey: string, onProgress: (p: SyncProgress) => void = () => {}): Promise<FileOutcome[]> {
  let entries
  try {
    // Gadgetbridge's order: say the host is ready to sync (the band may answer with what it has waiting), set the
    // directory filter, then read the directory. All files are asked for first, since Garmin Connect may have taken
    // the new ones; if that comes back empty, "only new" is tried too.
    await session.announceSyncReady()
    let all: ReturnType<typeof parseDirectory> = []
    for (const filter of [FILTER.ALL_FILES, FILTER.ONLY_NEW]) {
      try {
        await session.setDirectoryFilter(filter)
      } catch (e) {
        session.addLog('info', `directory filter not acknowledged: ${e instanceof Error ? e.message : String(e)}`)
      }
      all = parseDirectory(await session.legacyDownload(0)).filter((e) => e.dataType !== 0 || e.size > 0)
      session.addLog('info', `directory with filter ${filter}: ${all.length} real entries`)
      if (all.length) break
    }
    entries = wellnessEntries(all)
    session.addLog('info', `directory: ${all.length} files, ${entries.length} all-day (${[...new Set(entries.map((e) => WELLNESS_SUBTYPES[e.subType]))].join(', ') || 'none'})`)
    for (const e of all.slice(0, 60)) session.addLog('info', `  ${describeEntry(e)}`)
  } catch (e) {
    session.addLog('info', `older file transfer unavailable: ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
  const outcomes: FileOutcome[] = []
  const todo = []
  for (const e of entries) {
    const key = `${deviceKey}:legacy:${e.subType}:${e.fitTime}:${e.size}`
    if (await store.has(key)) outcomes.push({ uidHex: null, dataType: `FIT_TYPE_${e.subType}`, result: 'skipped-duplicate' })
    else todo.push({ e, key })
  }
  for (const [i, { e, key }] of todo.slice(0, MAX_LEGACY_FILES).entries()) {
    const dataType = `FIT_TYPE_${e.subType}`
    try {
      onProgress({ phase: 'downloading', current: { index: i, total: Math.min(todo.length, MAX_LEGACY_FILES), dataType: WELLNESS_SUBTYPES[e.subType], received: 0, size: e.size, attempt: 1 } })
      const bytes = await session.legacyDownload(e.fileIndex, (received) =>
        onProgress({ phase: 'downloading', current: { index: i, total: Math.min(todo.length, MAX_LEGACY_FILES), dataType: WELLNESS_SUBTYPES[e.subType], received, size: e.size, attempt: 1 } }),
      )
      const fit = validateAndDecodeFit(bytes, e.size)
      if (!fit.ok) throw new Error(fit.error)
      await store.put({
        key,
        deviceKey,
        uidHex: `legacy-${e.fileIndex}`,
        dataType,
        size: bytes.length,
        modifiedTime: entryDate(e).getTime(),
        syncedAt: Date.now(),
        status: 'unsupported',
        fileType: fit.fileType,
        activity: null,
        bytes,
      })
      outcomes.push({ uidHex: null, dataType, result: 'unsupported' })
    } catch (err) {
      outcomes.push({ uidHex: null, dataType, result: 'failed', error: err instanceof Error ? err.message : String(err) })
      if (session.state !== 'ready') break
    }
  }
  return outcomes
}
