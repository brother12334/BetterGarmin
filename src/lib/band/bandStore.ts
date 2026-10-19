import { useSyncExternalStore } from 'react'
import { BandSession, type SmartMessage } from './session'
import {
  decodeCommandResponse,
  decodeLiveSessionCapabilities,
  decodeLiveSessionEvents,
  decodeLocateStatus,
  decodeSubscribed,
  decodeSupportedAlerts,
  type ActivityStateName,
  type ActivityUuid,
  type LiveSessionEvent,
} from './liveSession'
import { decodeFileListPage, type FileListPage } from './files'
import {
  activityCommand,
  cancelFindMyWatch,
  eventSharingSupportedAlerts,
  fileAccessCapabilities,
  fileListRequest,
  findMyWatch,
  liveSessionCapabilities,
  subscribeLiveSessionEvents,
  type ActivityCommandName,
} from './smart'

/** One shared band connection for the whole app, so it survives navigating between pages. */
export const band = new BandSession()

/** Capability bits from the band's Configuration message. */
export const BAND_CAPS = { FIND_MY_WATCH: 9, SPORT_PROFILE_SETUP: 56, STRENGTH: 58, FILE_ACCESS: 90 } as const
/** Bits the tested client required before preparing activity control. */
const ACTIVITY_REQUIRED_BITS = [81, 95, 105]

/**
 * Lifecycle of one command, kept deliberately distinct:
 * sent = written to Bluetooth · accepted = the band's matched response had no failure · confirmed = the band then
 * reported the state that command should produce. A transport acknowledgment alone never counts as accepted.
 */
export type CommandStage = 'sending' | 'sent' | 'accepted' | 'confirmed' | 'failed' | 'uncertain'

export interface CommandStatus {
  command: ActivityCommandName
  stage: CommandStage
  requestId: number | null
  at: number
  error?: string
  /** The band state that confirmed it. */
  confirmedBy?: string
}

export interface BandEventRecord {
  at: number
  event: LiveSessionEvent
}

export interface ActivitySupport {
  state: 'not-checked' | 'checking' | 'ready' | 'unavailable'
  reason?: string
}

interface ActivityState {
  support: ActivitySupport
  command: CommandStatus | null
  events: BandEventRecord[]
  /** Latest state the band reported. */
  bandState: ActivityStateName | null
  /** From the band's ActivityStartRequest only; null means unknown, never guessed. */
  uuid: ActivityUuid | null
  /** Sport/sub-sport the band reported starting. */
  profile: { sport: number | null; subSport: number | null } | null
}

const INITIAL: ActivityState = { support: { state: 'not-checked' }, command: null, events: [], bandState: null, uuid: null, profile: null }
let activity: ActivityState = INITIAL
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
band.subscribe(emit)

function setActivity(patch: Partial<ActivityState>) {
  activity = { ...activity, ...patch }
  emit()
}

/** Band states that confirm each command, from the real-device capture (START → START/WORKOUT_ACTIVE, PAUSE → STOP, …). */
const CONFIRMS: Record<ActivityCommandName, (e: LiveSessionEvent) => boolean> = {
  START: (e) => e.kind === 'start' || (e.kind === 'state' && ['START', 'WORKOUT_ACTIVE', 'RESUME'].includes(e.state)),
  PAUSE: (e) => e.kind === 'state' && ['STOP', 'PAUSE'].includes(e.state),
  RESUME: (e) => e.kind === 'state' && ['START', 'RESUME', 'WORKOUT_ACTIVE'].includes(e.state),
  SAVE: (e) => e.kind === 'state' && (e.state === 'SAVING' || (e.state === 'ENDED' && e.endReason === 'SAVED')),
  DISCARD: (e) => e.kind === 'state' && (e.state === 'DISCARDING' || (e.state === 'ENDED' && e.endReason === 'DISCARDED')),
}

const describeEvent = (e: LiveSessionEvent) =>
  e.kind === 'state' ? `${e.state}${e.endReason ? ` (${e.endReason})` : ''}` : e.kind === 'start' ? `activity start ${e.sport ?? '?'}/${e.subSport ?? '?'}` : 'activity data'

/** Band-initiated messages: LiveSession events arrive as EventSharing alert notifications. */
function handleBandMessage(m: SmartMessage): boolean {
  if (m.kind !== 'request') return false
  let events: LiveSessionEvent[]
  try {
    events = decodeLiveSessionEvents(m.fields)
  } catch (e) {
    band.addLog('error', `malformed LiveSession event: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
  if (events.length === 0) return false
  const at = Date.now()
  let next = activity
  for (const event of events) {
    band.addLog('info', `band reported ${describeEvent(event)}`)
    next = {
      ...next,
      events: [...next.events.slice(-49), { at, event }],
      ...(event.kind === 'state' ? { bandState: event.state } : {}),
      ...(event.kind === 'start' ? { uuid: event.uuid, profile: { sport: event.sport, subSport: event.subSport } } : {}),
    }
    const cmd = next.command
    if (cmd && ['sent', 'accepted', 'sending'].includes(cmd.stage) && at >= cmd.at && CONFIRMS[cmd.command](event)) {
      next = { ...next, command: { ...cmd, stage: 'confirmed', confirmedBy: describeEvent(event) } }
    }
  }
  activity = next
  emit()
  return true
}
band.onSmart(handleBandMessage)

function withTimeout<T>(p: Promise<T>, ms = 15_000): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('No answer from the band')), ms))])
}

/** Discovers LiveSession support and subscribes to its events, as the tested client did before any command. */
async function prepareActivity() {
  setActivity({ ...INITIAL, support: { state: 'checking' } })
  try {
    const missing = ACTIVITY_REQUIRED_BITS.filter((b) => !band.bandConfigBits.includes(b))
    if (missing.length) throw new Error(`The band doesn't advertise capability ${missing.join(', ')}`)
    const caps = decodeLiveSessionCapabilities((await withTimeout(band.sendSmart(liveSessionCapabilities(), 'LiveSession capabilities').response)).fields)
    if (!caps.allowRemoteTerminate) throw new Error("The band doesn't allow apps to end activities remotely")
    const alerts = decodeSupportedAlerts((await withTimeout(band.sendSmart(eventSharingSupportedAlerts(), 'EventSharing supported alerts').response)).fields)
    if (!alerts.includes(19)) throw new Error("The band doesn't offer LiveSession events")
    const subscribed = decodeSubscribed((await withTimeout(band.sendSmart(subscribeLiveSessionEvents(), 'subscribe LiveSession events').response)).fields)
    if (!subscribed) throw new Error("The band didn't confirm the LiveSession subscription")
    if (!band.bandConfigBits.includes(BAND_CAPS.STRENGTH)) throw new Error("The band doesn't advertise Strength activities (capability 58)")
    setActivity({ support: { state: 'ready' } })
  } catch (e) {
    setActivity({ support: { state: 'unavailable', reason: e instanceof Error ? e.message : String(e) } })
  }
}

let lastState = band.state
band.subscribe(() => {
  if (band.state === 'ready' && lastState !== 'ready') void prepareActivity()
  if (band.state !== 'ready' && lastState === 'ready') setActivity({ support: { state: 'not-checked' } })
  lastState = band.state
})

export function bandActivityReady(): boolean {
  return band.state === 'ready' && activity.support.state === 'ready'
}

let queue: Promise<void> = Promise.resolve()
let startPending = false

/**
 * Queues an activity command and tracks it through sent → accepted → confirmed. Commands run one at a time in
 * order, so a quick pause after start isn't lost. A second START while one is pending is refused (returns false),
 * so a double tap can't start two activities. Timeouts are never retried automatically: the band may already have
 * acted, so the command is marked uncertain instead.
 */
export function sendActivityCommand(command: ActivityCommandName): boolean {
  if (!bandActivityReady()) return false
  if (command === 'START') {
    if (startPending) return false
    startPending = true
  }
  queue = queue.then(() => runCommand(command)).finally(() => {
    if (command === 'START') startPending = false
  })
  return true
}

async function runCommand(command: ActivityCommandName): Promise<void> {
  const status: CommandStatus = { command, stage: 'sending', requestId: null, at: Date.now() }
  setActivity({ command: status, ...(command === 'START' ? { uuid: null, profile: null, events: [], bandState: null } : {}) })
  let sent: ReturnType<typeof band.sendSmart>
  try {
    sent = band.sendSmart(activityCommand(command), `LiveSession ${command}`)
  } catch (e) {
    setActivity({ command: { ...status, stage: 'failed', error: e instanceof Error ? e.message : String(e) } })
    return
  }
  const update = (patch: Partial<CommandStatus>) => {
    const cur = activity.command
    if (cur?.requestId === sent.requestId) setActivity({ command: { ...cur, ...patch } })
  }
  setActivity({ command: { ...status, requestId: sent.requestId } })
  try {
    await sent.sent
  } catch (e) {
    update({ stage: 'failed', error: e instanceof Error ? e.message : String(e) })
    return
  }
  if (activity.command?.stage === 'sending') update({ stage: 'sent' })
  try {
    const result = decodeCommandResponse((await withTimeout(sent.response)).fields)
    if (!result.accepted) {
      update({ stage: 'failed', error: `The band rejected it (failure ${result.failure})` })
      return
    }
    // A matching band state may already have arrived; keep 'confirmed' in that case.
    if (activity.command?.stage !== 'confirmed') update({ stage: 'accepted' })
  } catch (e) {
    update({ stage: activity.command?.stage === 'confirmed' ? 'confirmed' : 'uncertain', error: e instanceof Error ? e.message : String(e) })
  }
}

/** Test band alert via Find My Watch. Resolves with the band's status (100 = OK). */
export async function testBandAlert(): Promise<number> {
  if (!band.bandConfigBits.includes(BAND_CAPS.FIND_MY_WATCH)) throw new Error("The band doesn't advertise Find My Watch (capability 9)")
  const status = decodeLocateStatus((await withTimeout(band.sendSmart(findMyWatch(), 'Find My Watch (test alert)').response, 12_000)).fields, false)
  if (status !== 100) throw new Error(`The band answered with status ${status === 200 ? 'ERROR' : status}`)
  return status
}

export async function cancelBandAlert(): Promise<number> {
  return decodeLocateStatus((await withTimeout(band.sendSmart(cancelFindMyWatch(), 'cancel Find My Watch').response, 12_000)).fields, true)
}

export interface FileListing {
  pages: FileListPage[]
  total: number
  complete: boolean
  /** Kept for future incremental listings; incremental behaviour hasn't been verified on the band. */
  nextTransactionId: number | null
}

const TX_KEY = 'bettergarmin:bandNextTransactionId'

export function savedNextTransactionId(): number | null {
  try {
    const v = localStorage.getItem(TX_KEY)
    return v == null ? null : Number(v)
  } catch {
    return null
  }
}

/**
 * Lists files on the band (read-only: nothing on the band is changed). Continues with the session ID the band
 * returns until it stops sending one, and stores the final next_transaction_id.
 */
export async function listBandFiles(maxPages = 8): Promise<FileListing> {
  if (!band.bandConfigBits.includes(BAND_CAPS.FILE_ACCESS)) throw new Error("The band doesn't advertise FileAccess (capability 90)")
  await withTimeout(band.sendSmart(fileAccessCapabilities(), 'FileAccess capabilities').response)
  const pages: FileListPage[] = []
  const seen = new Set<number>()
  let sessionId: number | null = null
  for (let i = 0; i < maxPages; i++) {
    const req = band.sendSmart(fileListRequest(sessionId == null ? { maxReferences: 10 } : { sessionId }), sessionId == null ? 'FileAccess list (max 10)' : `FileAccess list continue (session ${sessionId})`)
    const page = decodeFileListPage((await withTimeout(req.response)).fields)
    pages.push(page)
    if (page.complete) break
    if (page.sessionId != null && seen.has(page.sessionId) && page.items.length === 0) throw new Error('The file listing stopped making progress')
    if (page.sessionId != null) seen.add(page.sessionId)
    sessionId = page.sessionId
  }
  const last = pages[pages.length - 1]
  const nextTransactionId = last?.nextTransactionId ?? null
  if (nextTransactionId != null) {
    try {
      localStorage.setItem(TX_KEY, String(nextTransactionId))
    } catch {
      // fine to lose
    }
  }
  return { pages, total: pages.reduce((n, p) => n + p.items.length, 0), complete: !!last?.complete, nextTransactionId }
}

export interface BandSnapshot {
  state: BandSession['state']
  deviceName: string | null
  error: BandSession['error']
  log: BandSession['log']
  configBits: number[]
  protocolVersion: number | null
  routingHandle: number | null
  activity: ActivityState
}

let snapshot: BandSnapshot | null = null
function getSnapshot(): BandSnapshot {
  const next: BandSnapshot = {
    state: band.state,
    deviceName: band.deviceName,
    error: band.error,
    log: band.log,
    configBits: band.bandConfigBits,
    protocolVersion: band.bandProtocolVersion,
    routingHandle: band.routingHandle,
    activity,
  }
  if (snapshot && (Object.keys(next) as (keyof BandSnapshot)[]).every((k) => snapshot![k] === next[k])) return snapshot
  snapshot = next
  return snapshot
}

export function useBand(): BandSnapshot {
  return useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, getSnapshot)
}

/** UUID halves as one stable string for storage ("msb-wire-bytes / lsb-wire-bytes"). */
export function uuidKey(u: ActivityUuid | null): string | null {
  return u ? `${u.mostSignificant.replace(/ /g, '')}:${u.leastSignificant.replace(/ /g, '')}` : null
}

/** Test hook: the current activity state without React. */
export function getActivitySnapshotForTests(): ActivityState {
  return activity
}
