import { useSyncExternalStore } from 'react'
import { BandSession, type SmartMessage } from './session'
import { describe as describeProto, findAll, num, sub, type ProtoField } from './proto'
import {
  LIVE,
  SMART,
  activityCommand,
  cancelFindMyWatch,
  fileListRequest,
  findMyWatch,
  subscribeLiveSessionEvents,
  type ActivityCommandName,
} from './smart'

/** One shared band connection for the whole app, so it survives navigating between pages. */
export const band = new BandSession()

/**
 * Lifecycle of one command, kept deliberately distinct:
 * sent = written to Bluetooth · accepted = the band answered the request · confirmed = the band then reported an
 * activity event. A transport acknowledgment alone never counts as accepted.
 */
export type CommandStage = 'sending' | 'sent' | 'accepted' | 'confirmed' | 'failed'

export interface CommandStatus {
  command: ActivityCommandName
  stage: CommandStage
  requestId: number | null
  at: number
  error?: string
  /** The band's event that confirmed it, decoded generically (field numbers → values). */
  event?: unknown
}

export interface BandEvent {
  at: number
  source: 'live-session-event' | 'live-session-request'
  summary: unknown
  /** Every scalar value found in the event, by field path; enum names aren't mapped yet. */
  values: Record<string, number>
}

interface ActivityState {
  command: CommandStatus | null
  events: BandEvent[]
  /** Activity UUID the band returned, if one was found in its response or events. */
  uuid: string | null
}

let activity: ActivityState = { command: null, events: [], uuid: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
band.subscribe(emit)

function setActivity(patch: Partial<ActivityState>) {
  activity = { ...activity, ...patch }
  emit()
}

const CONFIRM_WINDOW_MS = 20_000
let awaitingConfirmation: { requestId: number; since: number } | null = null
let lastEventAt = 0

/** Pulls a UUID out of a decoded message: a 16-byte bytes field, or a UUID-shaped string. */
function findUuid(fields: ProtoField[] | null): string | null {
  for (const { field } of findAll(fields, (f) => f.wire === 2)) {
    const b = field.value as Uint8Array
    if (b.length === 16) {
      const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    }
    if (b.length === 36) {
      const s = new TextDecoder().decode(b)
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s.toLowerCase()
    }
  }
  return null
}

function scalarValues(fields: ProtoField[] | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const { field, path } of findAll(fields, (f) => f.wire === 0)) out[path.join('.')] = Number(field.value)
  return out
}

/** EventSharing alert notifications carry LiveSession events in extension 1012; the band can also send LiveSession requests. */
function handleBandMessage(m: SmartMessage) {
  if (m.kind !== 'request') return
  const liveEvent = findAll(m.fields, (f, path) => f.field === 1012 && path[0] === SMART.EVENT_SHARING)[0]
  const liveRequest = !liveEvent ? m.fields?.find((f) => f.field === SMART.LIVE_SESSION) : null
  if (!liveEvent && !liveRequest) return
  const body = sub(m.fields, liveEvent ? SMART.EVENT_SHARING : SMART.LIVE_SESSION)
  const event: BandEvent = {
    at: Date.now(),
    source: liveEvent ? 'live-session-event' : 'live-session-request',
    summary: describeProto(body),
    values: scalarValues(body),
  }
  const uuid = findUuid(body)
  lastEventAt = event.at
  setActivity({ events: [...activity.events.slice(-49), event], uuid: uuid ?? activity.uuid })
  band.addLog('info', `band activity event: ${JSON.stringify(event.values)}`)
  const cmd = activity.command
  if (cmd && awaitingConfirmation && cmd.stage === 'accepted' && Date.now() - awaitingConfirmation.since < CONFIRM_WINDOW_MS) {
    awaitingConfirmation = null
    setActivity({ command: { ...cmd, stage: 'confirmed', event: event.summary } })
  }
}
band.onSmart(handleBandMessage)

// Subscribe to LiveSession events as soon as each session becomes ready.
let lastState = band.state
band.subscribe(() => {
  if (band.state === 'ready' && lastState !== 'ready') {
    band.sendSmart(subscribeLiveSessionEvents(), 'subscribe LiveSession events (alert 19)').response.catch(() => {})
  }
  lastState = band.state
})

let queue: Promise<void> = Promise.resolve()
let startPending = false

/**
 * Queues an activity command and tracks it through sent → accepted → confirmed. Commands run one at a time in
 * order, so a quick pause after start isn't lost. A second START while one is still pending is refused (returns
 * false), so a double tap can't start two activities.
 */
export function sendActivityCommand(command: ActivityCommandName): boolean {
  if (band.state !== 'ready') return false
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
  awaitingConfirmation = null
  setActivity({ command: status, ...(command === 'START' ? { uuid: null, events: [] } : {}) })
  let sent: ReturnType<typeof band.sendSmart>
  try {
    sent = band.sendSmart(activityCommand(command), `LiveSession ${command}`)
  } catch (e) {
    setActivity({ command: { ...status, stage: 'failed', error: e instanceof Error ? e.message : String(e) } })
    return
  }
  setActivity({ command: { ...status, requestId: sent.requestId } })
  const update = (patch: Partial<CommandStatus>) => {
    if (activity.command?.requestId === sent.requestId) setActivity({ command: { ...activity.command, ...patch } })
  }
  try {
    await sent.sent
    update({ stage: 'sent' })
    const resp = await Promise.race([sent.response, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('No answer from the band')), 15_000))])
    const answer = sub(sub(resp.fields, SMART.LIVE_SESSION), LIVE.COMMAND_RESPONSE)
    if (!answer) throw new Error('The band answered, but not with an activity command response')
    const uuid = findUuid(answer)
    if (uuid) setActivity({ uuid })
    // The band may report its event before answering the request; that still confirms the command.
    const eventAlready = lastEventAt >= status.at ? activity.events[activity.events.length - 1] : null
    if (eventAlready) {
      update({ stage: 'confirmed', event: eventAlready.summary })
    } else {
      awaitingConfirmation = { requestId: sent.requestId, since: Date.now() }
      update({ stage: 'accepted', event: describeProto(answer) })
    }
  } catch (e) {
    update({ stage: 'failed', error: e instanceof Error ? e.message : String(e) })
  }
}

export function testBandAlert() {
  return band.sendSmart(findMyWatch(), 'Find My Watch (test alert)')
}

export function cancelBandAlert() {
  return band.sendSmart(cancelFindMyWatch(), 'cancel Find My Watch')
}

export interface FileListing {
  pages: { decoded: unknown; candidateReferences: number; sessionId: number | null }[]
  totalCandidates: number
  /** Scalar fields of the final page, kept so a future incremental listing can use next_transaction_id once its field is confirmed. */
  finalValues: Record<string, number>
}

/**
 * Lists files on the band (FileAccess item-list request). The response schema isn't recovered yet, so pages are
 * decoded generically: references are counted as the most repeated embedded-message field, and the listing continues
 * while a session ID (field 1) comes back. Nothing on the band is changed.
 */
export async function listBandFiles(maxPages = 10): Promise<FileListing> {
  const pages: FileListing['pages'] = []
  let sessionId: number | null = null
  let finalValues: Record<string, number> = {}
  for (let page = 0; page < maxPages; page++) {
    const req = band.sendSmart(fileListRequest(sessionId == null ? { maxReferences: 10 } : { sessionId }), sessionId == null ? 'FileAccess list (max 10)' : `FileAccess list continue (session ${sessionId})`)
    const resp = await Promise.race([req.response, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('No answer from the band')), 15_000))])
    const list = sub(sub(resp.fields, SMART.FILE_ACCESS), 10)
    if (!list) throw new Error('The band answered without an item-list response')
    const counts = new Map<number, number>()
    for (const f of list) if (f.wire === 2) counts.set(f.field, (counts.get(f.field) ?? 0) + 1)
    const candidateReferences = Math.max(0, ...counts.values())
    const nextSession = num(list, 1)
    pages.push({ decoded: describeProto(list), candidateReferences, sessionId: nextSession })
    finalValues = scalarValues(list)
    if (nextSession == null || nextSession === sessionId) break
    sessionId = nextSession
  }
  return { pages, totalCandidates: pages.reduce((n, p) => n + p.candidateReferences, 0), finalValues }
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

/** Capability bits seen in the band's Configuration message. */
export const BAND_CAPS = { STRENGTH: 58, SPORT_PROFILE_SETUP: 56, FILE_ACCESS: 90 } as const
