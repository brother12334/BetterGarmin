import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { InfoButton } from '../../components/ui/InfoButton'
import { getSleepEventsForDay, getSleepRange } from '../../db/queries'
import type { SleepEventRow, SleepRow } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { formatHoursMinutes, hmsToMinutes } from '../../lib/duration'
import { parseSleepTimestamp } from '../training/matchGarminActivity'
import { formatTime } from '../../lib/clock'

/**
 * Last night's sleep: total, bed and wake times, a stage-by-stage timeline (when Garmin recorded stage events)
 * and how many minutes went to each stage.
 */

type Stage = 'awake' | 'rem' | 'light' | 'deep'

const STAGES: { key: Stage; label: string; color: string; column: keyof SleepRow; typical: string }[] = [
  { key: 'awake', label: 'Awake', color: '#f59e8b', column: 'awake', typical: 'brief wakings are normal' },
  { key: 'rem', label: 'REM', color: '#8b7bf6', column: 'rem_sleep', typical: 'typically 20–25%' },
  { key: 'light', label: 'Light', color: '#60a5fa', column: 'light_sleep', typical: 'typically about half' },
  { key: 'deep', label: 'Deep', color: '#4338ca', column: 'deep_sleep', typical: 'typically 13–23%' },
]

const LOOKBACK_DAYS = 3

const EVENT_STAGE: Record<string, Stage> = {
  deep_sleep: 'deep',
  light_sleep: 'light',
  rem_sleep: 'rem',
  awake: 'awake',
  wake_time: 'awake',
}

function nightLabel(day: string): string {
  return new Date(`${day.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function clock(ts: string | null): string | null {
  const ms = parseSleepTimestamp(ts)
  return ms == null ? null : formatTime(ms)
}

function stageMinutes(row: SleepRow): number {
  return STAGES.reduce((sum, s) => sum + (hmsToMinutes(row[s.column] as string | null) ?? 0), 0)
}

/** Finds the most recent night (up to a few days back) that actually has stage data, then shows it. */
export function HowYouSlept({ day }: { day: string }) {
  const [night, setNight] = useState<{ sleep: SleepRow; events: SleepEventRow[] } | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await getSleepRange(addDays(day, -LOOKBACK_DAYS), day)
        const latest = [...rows].reverse().find((r) => stageMinutes(r) > 0) ?? null
        const events = latest ? await getSleepEventsForDay(addDays(latest.day.slice(0, 10), -1)).catch(() => []) : []
        if (!cancelled) setNight(latest ? { sleep: latest, events } : null)
      } catch {
        if (!cancelled) setNight(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [day])

  if (night === undefined) return null
  if (night === null) {
    return (
      <Card>
        <p className="font-semibold">How you slept</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          No sleep recorded in the last few nights yet. Wear your watch to bed; the breakdown appears after it syncs
          the next morning.
        </p>
      </Card>
    )
  }
  return <NightCard sleep={night.sleep} events={night.events} isLastNight={night.sleep.day.slice(0, 10) === day} />
}

function NightCard({ sleep, events, isLastNight }: { sleep: SleepRow; events: SleepEventRow[]; isLastNight: boolean }) {

  const minutes = STAGES.map((s) => ({ ...s, min: hmsToMinutes(sleep[s.column] as string | null) ?? 0 }))
  const inBed = minutes.reduce((sum, s) => sum + s.min, 0)
  const asleep = hmsToMinutes(sleep.total_sleep) ?? inBed - minutes[0].min
  const bed = clock(sleep.start)
  const wake = clock(sleep.end)

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-semibold">{isLastNight ? 'How you slept' : `How you slept · ${nightLabel(sleep.day)}`}</p>
            <InfoButton title="Sleep stages">
              Stages are Garmin's estimates from heart rate, heart-rate variability and movement. The typical ranges are
              general adult guidance, not targets. Stage mix varies from night to night and between people.
            </InfoButton>
          </div>
          {bed && wake && (
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              {bed} → {wake}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{formatHoursMinutes(asleep)}</p>
          <p className="text-xs text-[var(--text-tertiary)]">asleep{sleep.score != null ? ` · score ${sleep.score}` : ''}</p>
        </div>
      </div>

      {events.length > 0 ? <StageTimeline events={events} /> : <StackedBar parts={minutes} total={inBed} />}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {minutes.map((s) => {
          const pct = Math.round((s.min / inBed) * 100)
          return (
            <div key={s.key} className="rounded-[var(--radius-control)] bg-[var(--bg-panel)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </div>
              <p className="mt-1 text-lg font-bold tabular-nums">
                {formatHoursMinutes(s.min)} <span className="text-xs font-medium text-[var(--text-tertiary)]">{pct}%</span>
              </p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--ring-track)]">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{s.typical}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function StackedBar({ parts, total }: { parts: { key: Stage; color: string; min: number }[]; total: number }) {
  return (
    <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-[var(--ring-track)]">
      {[...parts].reverse().map((p) => (
        <div key={p.key} style={{ width: `${(p.min / total) * 100}%`, backgroundColor: p.color }} />
      ))}
    </div>
  )
}

/** A stepped timeline: awake at the top, deep at the bottom, like a hypnogram. */
function StageTimeline({ events }: { events: SleepEventRow[] }) {
  const blocks = events
    .map((e) => {
      const start = parseSleepTimestamp(e.timestamp)
      const dur = (hmsToMinutes(e.duration) ?? 0) * 60000
      const stage = EVENT_STAGE[e.event]
      return start != null && stage && dur > 0 ? { start, end: start + dur, stage } : null
    })
    .filter((b): b is { start: number; end: number; stage: Stage } => b != null)
    .sort((a, b) => a.start - b.start)
  if (blocks.length === 0) return null

  const t0 = blocks[0].start
  const span = Math.max(1, blocks[blocks.length - 1].end - t0)
  const row = Object.fromEntries(STAGES.map((s, i) => [s.key, i])) as Record<Stage, number>
  const color = Object.fromEntries(STAGES.map((s) => [s.key, s.color])) as Record<Stage, string>
  const ROW_H = 14
  const GAP = 6

  return (
    <div className="mt-4 flex gap-2">
      <div className="flex flex-col justify-between py-0.5 text-[10px] text-[var(--text-tertiary)]" style={{ gap: GAP }}>
        {STAGES.map((s) => (
          <span key={s.key} style={{ height: ROW_H, lineHeight: `${ROW_H}px` }}>
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative flex-1" style={{ height: STAGES.length * ROW_H + (STAGES.length - 1) * GAP }}>
        {STAGES.map((s, i) => (
          <div
            key={s.key}
            className="absolute inset-x-0 rounded-full bg-[var(--ring-track)]"
            style={{ top: i * (ROW_H + GAP) + ROW_H / 2 - 1, height: 2 }}
          />
        ))}
        {blocks.map((b, i) => (
          <div
            key={i}
            className="absolute rounded-[4px]"
            style={{
              left: `${((b.start - t0) / span) * 100}%`,
              width: `max(2px, ${((b.end - b.start) / span) * 100}%)`,
              top: row[b.stage] * (ROW_H + GAP),
              height: ROW_H,
              backgroundColor: color[b.stage],
            }}
          />
        ))}
      </div>
    </div>
  )
}
