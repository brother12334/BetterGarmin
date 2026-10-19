/**
 * What BetterGarmin last saw on the band, per file: so the app can say "saved on band" for a workout that hasn't
 * downloaded yet, and remember why a download failed. Holds file IDs, types, sizes and errors only — no health values.
 */

export interface BandFileState {
  key: string
  uidHex: string
  dataType: string | null
  size: number | null
  modifiedTime: number | null
  /** Last time this file appeared in a listing from the band. */
  seenOnBandAt: number
  lastError: string | null
  attempts: number
}

const KEY = 'bettergarmin:bandIndex'
const LAST_SYNC_KEY = 'bettergarmin:bandLastSync'

export const bandIndexEvents = new EventTarget()

function read(): Record<string, BandFileState> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

function write(v: Record<string, BandFileState>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // storage full or blocked: the index is a convenience, the files themselves are in IndexedDB
  }
  bandIndexEvents.dispatchEvent(new Event('change'))
}

export function bandIndex(): Record<string, BandFileState> {
  return read()
}

export function recordSeen(files: Omit<BandFileState, 'seenOnBandAt' | 'lastError' | 'attempts'>[]) {
  const cur = read()
  const now = Date.now()
  for (const f of files) cur[f.key] = { ...cur[f.key], ...f, seenOnBandAt: now, lastError: cur[f.key]?.lastError ?? null, attempts: cur[f.key]?.attempts ?? 0 }
  write(cur)
}

export function recordAttempt(key: string, error: string | null) {
  const cur = read()
  if (!cur[key]) return
  cur[key] = { ...cur[key], lastError: error, attempts: error ? cur[key].attempts + 1 : 0 }
  write(cur)
}

export function lastBandSync(): number | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function markBandSynced() {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
  } catch {
    // fine
  }
  bandIndexEvents.dispatchEvent(new Event('change'))
}

export function clearBandIndex() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(LAST_SYNC_KEY)
  } catch {
    // fine
  }
  bandIndexEvents.dispatchEvent(new Event('change'))
}
