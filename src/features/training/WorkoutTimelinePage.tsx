import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Chart } from '../../components/ui/Chart'
import { InfoButton } from '../../components/ui/InfoButton'
import { Skeleton } from '../../components/ui/Skeleton'
import { useUnits } from '../../app/units'
import { formatWeight } from '../../lib/units'
import { useWorkoutTimeline } from './useWorkoutTimeline'
import { SPLIT_NAMES } from '../../lib/strengthPlans'
import type { TimelineSegment, SegmentType } from './workoutTimeline'

const SEGMENT_COLORS: Record<SegmentType, string> = {
  warmup: 'rgba(245, 166, 35, 0.22)',
  set: 'rgba(251, 74, 89, 0.3)',
  rest: 'rgba(56, 189, 248, 0.16)',
  transition: 'rgba(167, 139, 250, 0.22)',
  cooldown: 'rgba(52, 211, 153, 0.18)',
}

const SEGMENT_LABELS: Record<SegmentType, string> = {
  warmup: 'Warm-up',
  set: 'Set',
  rest: 'Rest',
  transition: 'Transition',
  cooldown: 'Cool-down',
}

const GAP_COLOR = 'rgba(148, 163, 184, 0.28)'

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function WorkoutTimelinePage() {
  const { workoutId } = useParams<{ workoutId: string }>()
  const { units } = useUnits()
  const { loading, workout, matchedActivity, timeline, readiness } = useWorkoutTimeline(workoutId)
  const [selected, setSelected] = useState<TimelineSegment | null>(null)

  const chartOption = useMemo(() => {
    if (!timeline) return null

    // break the HR line across data gaps instead of connecting across them
    const gapSet = timeline.gapRanges
    const lineData: (number | string)[][] = []
    for (const p of timeline.hrSeries) {
      const inGap = gapSet.some((g) => p.t >= g.startMs && p.t <= g.endMs)
      lineData.push([p.t, inGap ? ('-' as unknown as number) : p.v])
    }

    const markAreaData: [{ name: string; xAxis: number; itemStyle: { color: string } }, { xAxis: number }][] = [
      ...timeline.segments.map(
        (seg, i): [{ name: string; xAxis: number; itemStyle: { color: string } }, { xAxis: number }] => [
          { name: `seg-${i}`, xAxis: seg.startMs, itemStyle: { color: SEGMENT_COLORS[seg.type] } },
          { xAxis: seg.endMs },
        ],
      ),
      ...timeline.gapRanges.map(
        (g): [{ name: string; xAxis: number; itemStyle: { color: string } }, { xAxis: number }] => [
          { name: 'gap', xAxis: g.startMs, itemStyle: { color: GAP_COLOR } },
          { xAxis: g.endMs },
        ],
      ),
    ]

    return {
      grid: { left: 40, right: 12, top: 16, bottom: 28, containLabel: true },
      xAxis: {
        type: 'time' as const,
        axisLine: { lineStyle: { color: 'var(--border-panel)' } },
        axisLabel: { color: 'var(--text-tertiary)', formatter: (v: number) => formatClock(v) },
      },
      yAxis: { type: 'value' as const, name: 'bpm', splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
      series: [
        {
          type: 'line' as const,
          data: lineData,
          connectNulls: false,
          symbol: 'none' as const,
          lineStyle: { color: '#fb4a59', width: 1.75 },
          markArea: { silent: false, data: markAreaData },
        },
      ],
    }
  }, [timeline])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="flex flex-col gap-6">
        <Link to="/training/strength" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          ← Back to Strength
        </Link>
        <Card className="text-center text-[var(--text-secondary)]">Workout not found.</Card>
      </div>
    )
  }

  const title = workout.title || (workout.split !== 'custom' ? SPLIT_NAMES[workout.split] : 'Workout')

  return (
    <div className="flex flex-col gap-6">
      <Link to="/training/strength" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        ← Back to Strength
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {new Date(`${workout.day}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })}
          {workout.gym ? ` · ${workout.gym}` : ''}
        </p>
      </div>

      {readiness && (readiness.sleepScore != null || readiness.restingHr != null || readiness.hrvStatus != null || readiness.bodyBatteryMax != null) && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">How recovered you were</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {readiness.sleepScore != null && <ReadinessStat label="Sleep score" value={`${readiness.sleepScore}`} />}
            {readiness.sleepTotalMinutes != null && (
              <ReadinessStat label="Sleep" value={`${Math.floor(readiness.sleepTotalMinutes / 60)}h ${Math.round(readiness.sleepTotalMinutes % 60)}m`} />
            )}
            {readiness.restingHr != null && <ReadinessStat label="Resting HR" value={`${readiness.restingHr} bpm`} />}
            {readiness.hrvStatus != null && <ReadinessStat label="HRV status" value={readiness.hrvStatus} />}
            {readiness.bodyBatteryMin != null && readiness.bodyBatteryMax != null && (
              <ReadinessStat label="Body Battery that day" value={`${readiness.bodyBatteryMin}–${readiness.bodyBatteryMax}`} />
            )}
          </div>
        </Card>
      )}

      {!matchedActivity && (
        <Card className="text-sm text-[var(--text-secondary)]">
          No Garmin activity overlapping this workout's time window was found, so there's no heart-rate timeline to show —
          only what was logged. Make sure your Garmin data covers {new Date(`${workout.day}T00:00:00`).toLocaleDateString()} and re-import if needed.
        </Card>
      )}

      {matchedActivity && timeline && chartOption && (
        <>
          <Card>
            <div className="mb-2 flex items-center gap-1.5">
              <p className="font-semibold">Full workout timeline</p>
              <InfoButton title="Timeline">
                Heart rate from your matched Garmin activity, with each set and rest from your logged workout marked
                as a colored band. Set boundaries are estimated from each set's logged time and reported rest — not
                independently measured. Gray bands mean Garmin has no data for that stretch. Tap a band for its stats.
              </InfoButton>
            </div>
            <Chart
              option={chartOption}
              height={260}
              onClick={(params) => {
                if (params.componentType !== 'markArea') return
                if (!params.name || params.name === 'gap') return
                const idx = Number(params.name.replace('seg-', ''))
                if (!Number.isNaN(idx)) setSelected(timeline.segments[idx] ?? null)
              }}
            />
            <Legend />
          </Card>

          {selected && <SegmentDetail segment={selected} units={units} onClose={() => setSelected(null)} />}

          <Card>
            <p className="mb-3 font-semibold">Summary</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Total time" value={formatDuration(timeline.totalMs)} />
              <Stat label="Time in sets" value={formatDuration(timeline.setMs)} />
              <Stat label="Time resting" value={formatDuration(timeline.restMs)} />
              <Stat label="Avg HR" value={timeline.hrAvg != null ? `${timeline.hrAvg} bpm` : '—'} />
              <Stat label="Peak HR" value={timeline.hrPeak != null ? `${timeline.hrPeak} bpm` : '—'} />
              <Stat label="Calories" value={matchedActivity.calories != null ? `${matchedActivity.calories}` : '—'} />
              <Stat label="Training load" value={matchedActivity.training_load != null ? matchedActivity.training_load.toFixed(1) : '—'} />
              <Stat label="Training effect" value={matchedActivity.training_effect != null ? matchedActivity.training_effect.toFixed(1) : '—'} />
              <Stat label="Avg breaths/min" value={matchedActivity.avg_rr != null ? matchedActivity.avg_rr.toFixed(0) : '—'} />
            </div>
            <p className="mt-3 text-xs text-[var(--text-tertiary)]">
              Recovery time isn't shown — GarminDB doesn't export Garmin's recovery-time recommendation. Garmin's own
              rep/set detection isn't available either: GarminDB discards that data when importing strength
              activities, which is the whole reason this page exists.
            </p>
          </Card>

          <EffortBands bandsMs={timeline.effortBandsMs} />

          <ExerciseBreakdown segments={timeline.segments} units={units} />
        </>
      )}
    </div>
  )
}

function ReadinessStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[var(--text-tertiary)]">{label}</p>
      <p className="font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-panel)] p-3">
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

function Legend() {
  const entries: [SegmentType, string][] = [
    ['warmup', SEGMENT_LABELS.warmup],
    ['set', SEGMENT_LABELS.set],
    ['rest', SEGMENT_LABELS.rest],
    ['transition', SEGMENT_LABELS.transition],
    ['cooldown', SEGMENT_LABELS.cooldown],
  ]
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--text-tertiary)]">
      {entries.map(([type, label]) => (
        <span key={type} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS[type] }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: GAP_COLOR }} />
        No Garmin data
      </span>
    </div>
  )
}

function SegmentDetail({ segment, units, onClose }: { segment: TimelineSegment; units: ReturnType<typeof useUnits>['units']; onClose: () => void }) {
  const durationMs = segment.endMs - segment.startMs
  return (
    <Card className="border-sky-400/30">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold">
          {segment.type === 'set'
            ? `${segment.exercise} — Set ${segment.setNumber}${segment.isWarmupSet ? ' (warm-up)' : ''}`
            : SEGMENT_LABELS[segment.type]}
        </p>
        <button type="button" onClick={onClose} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          Close
        </button>
      </div>
      <p className="mb-2 text-xs text-[var(--text-tertiary)]">
        {formatClock(segment.startMs)} – {formatClock(segment.endMs)} · {formatDuration(durationMs)}
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {segment.type === 'set' && (
          <>
            <Stat label="Weight" value={formatWeight(segment.weight, units, 1)} />
            <Stat label="Reps" value={segment.reps != null ? `${segment.reps}` : '—'} />
            <Stat label="RPE" value={segment.rpe != null ? `${segment.rpe}` : '—'} />
          </>
        )}
        <Stat label="HR at start" value={segment.hrStart != null ? `${segment.hrStart} bpm` : '—'} />
        <Stat label="HR at end" value={segment.hrEnd != null ? `${segment.hrEnd} bpm` : '—'} />
        <Stat label="Avg HR" value={segment.hrAvg != null ? `${segment.hrAvg} bpm` : '—'} />
        <Stat label="Peak HR" value={segment.hrPeak != null ? `${segment.hrPeak} bpm` : '—'} />
        {segment.type === 'rest' && segment.hrStart != null && segment.hrEnd != null && (
          <Stat label="HR recovery" value={`${segment.hrStart - segment.hrEnd >= 0 ? '−' : '+'}${Math.abs(segment.hrStart - segment.hrEnd)} bpm`} />
        )}
      </div>
      {segment.personalRecord && <p className="mt-2 text-xs font-semibold text-amber-400">🏆 Personal record</p>}
      {segment.note && <p className="mt-2 text-xs text-[var(--text-secondary)]">"{segment.note}"</p>}
      {!segment.hasGarminData && <p className="mt-2 text-xs text-[var(--text-tertiary)]">No Garmin data during this segment.</p>}
    </Card>
  )
}

function EffortBands({ bandsMs }: { bandsMs: number[] }) {
  const total = bandsMs.reduce((s, v) => s + v, 0)
  if (total === 0) return null
  const labels = ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%']
  const colors = ['#38bdf8', '#34d399', '#f5a623', '#fb8a3c', '#fb4a59']
  return (
    <Card>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="font-semibold">Effort through the session</p>
        <InfoButton title="Effort bands">
          Time spent at each band of heart rate, relative to today's own peak HR — a self-comparison, not a
          clinical/age-based training-zone system.
        </InfoButton>
      </div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--ring-track)]">
        {bandsMs.map((ms, i) => (ms > 0 ? <div key={i} style={{ width: `${(ms / total) * 100}%`, backgroundColor: colors[i] }} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
        {labels.map((label, i) =>
          bandsMs[i] > 0 ? (
            <span key={label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors[i] }} />
              {label}: {formatDuration(bandsMs[i])}
            </span>
          ) : null,
        )}
      </div>
    </Card>
  )
}

function ExerciseBreakdown({ segments, units }: { segments: TimelineSegment[]; units: ReturnType<typeof useUnits>['units'] }) {
  const byExercise = new Map<string, TimelineSegment[]>()
  for (const seg of segments) {
    if (seg.type !== 'set' || !seg.exercise) continue
    const list = byExercise.get(seg.exercise) ?? []
    list.push(seg)
    byExercise.set(seg.exercise, list)
  }
  if (byExercise.size === 0) return null

  return (
    <Card>
      <p className="mb-3 font-semibold">Per-exercise breakdown</p>
      <div className="flex flex-col gap-4">
        {Array.from(byExercise.entries()).map(([exercise, sets]) => (
          <div key={exercise}>
            <p className="mb-1.5 text-sm font-semibold">{exercise}</p>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--text-tertiary)]">
                  <th className="py-1 pr-2 font-medium">Set</th>
                  <th className="py-1 pr-2 font-medium">Weight</th>
                  <th className="py-1 pr-2 font-medium">Reps</th>
                  <th className="py-1 pr-2 font-medium">RPE</th>
                  <th className="py-1 pr-2 font-medium">HR start→end</th>
                </tr>
              </thead>
              <tbody>
                {sets.map((s, i) => (
                  <tr key={i} className="border-t border-[var(--border-panel)]">
                    <td className="py-1 pr-2">{s.setNumber}{s.isWarmupSet ? ' (WU)' : ''}</td>
                    <td className="py-1 pr-2">{formatWeight(s.weight, units, 1)}</td>
                    <td className="py-1 pr-2">{s.reps ?? '—'}</td>
                    <td className="py-1 pr-2">{s.rpe ?? '—'}</td>
                    <td className="py-1 pr-2">
                      {s.hrStart != null && s.hrEnd != null ? `${s.hrStart} → ${s.hrEnd}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  )
}
