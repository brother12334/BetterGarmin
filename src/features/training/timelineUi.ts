import type { SegmentType } from './workoutTimeline'
import { formatTime } from '../../lib/clock'

export const SEGMENT_COLORS: Record<SegmentType, string> = {
  warmup: 'rgba(245, 166, 35, 0.18)',
  set: 'rgba(251, 74, 89, 0.24)',
  rest: 'rgba(56, 189, 248, 0.12)',
  transition: 'rgba(167, 139, 250, 0.18)',
  cooldown: 'rgba(52, 211, 153, 0.14)',
}
export const SELECTED_COLOR = 'rgba(251, 74, 89, 0.55)'
export const GAP_COLOR = 'rgba(148, 163, 184, 0.28)'
export const SEGMENT_LABELS: Record<SegmentType, string> = { warmup: 'Warm-up', set: 'Set', rest: 'Rest', transition: 'Transition', cooldown: 'Cool-down' }

export const clock = (ms: number) => formatTime(ms, { seconds: true })
export const clockShort = (ms: number) => formatTime(ms)

export function duration(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export const bpm = (v: number | null | undefined) => (v != null ? `${v} bpm` : '—')
