import { lfield, vfield } from './proto'

/**
 * Smart protobuf payloads (the bytes inside a 5043 Protobuf Request). Field numbers come from the
 * real-device captures: Smart 12 = Find My Watch, 13 = Core, 30 = EventSharing, 43 = FileAccess,
 * 56 = LiveSession.
 */
export const SMART = { FIND_MY_WATCH: 12, CORE: 13, EVENT_SHARING: 30, FILE_ACCESS: 43, LIVE_SESSION: 56 } as const

/** LiveSession field 17 = app-initiated activity command request, 18 = its response. */
export const LIVE = { COMMAND_REQUEST: 17, COMMAND_RESPONSE: 18 } as const

/** Activity command enum (LiveSession command request field 2). Discard (4) is derived, not physically verified. */
export const ActivityCommand = { START: 0, RESUME: 1, PAUSE: 2, SAVE: 3, DISCARD: 4 } as const
export type ActivityCommandName = keyof typeof ActivityCommand

/** Strength: sport 10, sub-sport 20 (confirmed on a CIRQA). */
export const STRENGTH = { sport: 10, subSport: 20 } as const

export function liveSessionCapabilities(): number[] {
  return lfield(SMART.CORE, lfield(8, lfield(35, [])))
}

export function eventSharingSupportedAlerts(): number[] {
  return lfield(SMART.EVENT_SHARING, lfield(4, []))
}

export function subscribeLiveSessionEvents(alertType = 19): number[] {
  return lfield(SMART.EVENT_SHARING, lfield(1, lfield(1, vfield(1, alertType))))
}

export function activityCommand(command: ActivityCommandName, profile = STRENGTH): number[] {
  const body =
    command === 'START'
      ? [...lfield(1, [...vfield(1, profile.sport), ...vfield(2, profile.subSport)]), ...vfield(2, ActivityCommand.START)]
      : vfield(2, ActivityCommand[command])
  return lfield(SMART.LIVE_SESSION, lfield(LIVE.COMMAND_REQUEST, body))
}

export function findMyWatch(): number[] {
  return lfield(SMART.FIND_MY_WATCH, lfield(1, vfield(1, 3)))
}

export function cancelFindMyWatch(): number[] {
  return lfield(SMART.FIND_MY_WATCH, lfield(3, []))
}

export function fileAccessCapabilities(): number[] {
  return lfield(SMART.CORE, lfield(8, lfield(16, [])))
}

/** FileAccess field 9 = item-list request: field 1 session ID (to continue), 2 transaction ID, 3 max references. */
export function fileListRequest(opts: { maxReferences?: number; sessionId?: number; transactionId?: number }): number[] {
  const body = [
    ...(opts.sessionId != null ? vfield(1, opts.sessionId) : []),
    ...(opts.transactionId != null ? vfield(2, opts.transactionId) : []),
    ...(opts.maxReferences != null ? vfield(3, opts.maxReferences) : []),
  ]
  return lfield(SMART.FILE_ACCESS, lfield(9, body))
}

/**
 * FileAccess field 1 = PullItemDataRequest. It only negotiates a transfer; the bytes travel over a separate
 * reliable MultiLink pipe that BetterGarmin does not implement yet, so this is built but never sent.
 */
export function pullItemDataRequest(itemReference: Uint8Array, opts: { priority?: number; compressionWindow?: number } = {}): number[] {
  return lfield(
    SMART.FILE_ACCESS,
    lfield(1, [
      ...lfield(1, itemReference),
      ...(opts.priority != null ? vfield(2, opts.priority) : []),
      ...vfield(3, 0), // MULTILINK_TRANSPORT_PIPE
      ...vfield(4, 0), // fresh download
      ...(opts.compressionWindow != null ? vfield(5, opts.compressionWindow) : []),
    ]),
  )
}
