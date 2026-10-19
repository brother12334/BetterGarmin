import { useSyncExternalStore } from 'react'
import { bandActivityReady, sendActivityCommand } from '../../lib/band/bandStore'
import type { ActivityCommandName } from '../../lib/band/smart'

/**
 * A workout running in BetterGarmin right now. It is the source of truth for the session: the band mirrors it when
 * connected, but logging keeps working if Bluetooth drops or was never connected.
 */
export interface LiveWorkout {
  status: 'idle' | 'active' | 'paused'
  startedAt: number | null
  /** Total paused time so far, ms. */
  pausedMs: number
  pausedAt: number | null
  /** Whether the band was told to start a matching Strength activity. */
  bandLinked: boolean
}

export interface FinishedWorkout {
  startedAt: number
  finishedAt: number
  activeMs: number
  bandLinked: boolean
}

const KEY = 'bettergarmin:liveWorkout'
const IDLE: LiveWorkout = { status: 'idle', startedAt: null, pausedMs: 0, pausedAt: null, bandLinked: false }

function load(): LiveWorkout {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...IDLE, ...(JSON.parse(raw) as Partial<LiveWorkout>) }
  } catch {
    // start fresh
  }
  return IDLE
}

let state = load()
const listeners = new Set<() => void>()

function set(next: LiveWorkout) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // the session just won't survive a reload
  }
  listeners.forEach((l) => l())
}

export function useLiveWorkout(): LiveWorkout {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Mirrors a step on the band when it's connected. Never blocks or fails the in-app step. */
function mirror(command: ActivityCommandName): boolean {
  if (!bandActivityReady()) return false
  return sendActivityCommand(command)
}

export function startLiveWorkout(): void {
  if (state.status !== 'idle') return // already running: a second tap must not start another
  const bandLinked = mirror('START')
  set({ status: 'active', startedAt: Date.now(), pausedMs: 0, pausedAt: null, bandLinked })
}

export function pauseLiveWorkout(): void {
  if (state.status !== 'active') return
  if (state.bandLinked) mirror('PAUSE')
  set({ ...state, status: 'paused', pausedAt: Date.now() })
}

export function resumeLiveWorkout(): void {
  if (state.status !== 'paused') return
  if (state.bandLinked) mirror('RESUME')
  set({ ...state, status: 'active', pausedMs: state.pausedMs + (Date.now() - (state.pausedAt ?? Date.now())), pausedAt: null })
}

/** Starts the band activity for a workout that began before the band was connected. */
export function linkBandToLiveWorkout(): boolean {
  if (state.status === 'idle' || state.bandLinked) return false
  const ok = mirror('START')
  if (ok) set({ ...state, bandLinked: true })
  return ok
}

/** Ends the workout, saving the band activity. Returns the timing for the workout log. */
export function finishLiveWorkout(): FinishedWorkout | null {
  if (state.status === 'idle' || state.startedAt == null) return null
  const now = Date.now()
  const pausedMs = state.pausedMs + (state.pausedAt ? now - state.pausedAt : 0)
  if (state.bandLinked) mirror('SAVE')
  const done: FinishedWorkout = { startedAt: state.startedAt, finishedAt: now, activeMs: now - state.startedAt - pausedMs, bandLinked: state.bandLinked }
  set(IDLE)
  return done
}

/** Throws the workout away, discarding the band activity too. Callers must confirm with the user first. */
export function discardLiveWorkout(): void {
  if (state.status === 'idle') return
  if (state.bandLinked) mirror('DISCARD')
  set(IDLE)
}

export function elapsedMs(w: LiveWorkout, now = Date.now()): number {
  if (w.startedAt == null) return 0
  return now - w.startedAt - w.pausedMs - (w.pausedAt ? now - w.pausedAt : 0)
}
