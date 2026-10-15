import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getAllWorkoutsWithSets, type WorkoutWithSets } from '../../db/strengthLog'
import { Card } from '../../components/ui/Card'
import { InfoButton } from '../../components/ui/InfoButton'
import { Skeleton } from '../../components/ui/Skeleton'
import { useUnits } from '../../app/units'
import { formatWeight } from '../../lib/units'
import { SPLIT_NAMES } from '../../lib/strengthPlans'
import { useWorkoutTimeline, type HrSource, type PreviousExerciseSession } from './useWorkoutTimeline'
import { TimelineCard } from './TimelineCard'
import { bpm, clock, duration } from './timelineUi'
import {
  PRE_SET_WINDOW_MS,
  RETURN_MARGIN_BPM,
  type BoundarySource,
  type Confidence,
  type SetAnalysis,
  type WorkoutTimeline,
} from './workoutTimeline'

const SOURCE_LABELS: Record<BoundarySource, string> = {
  logged: 'logged',
  corrected: 'corrected by you',
  'estimated-from-rest': 'estimated from reported rest',
  'estimated-default': 'estimated (no rest reported)',
  clamped: 'placeholder',
}
const CONFIDENCE_STYLE: Record<Confidence, { label: string; className: string }> = {
  high: { label: 'High confidence', className: 'bg-emerald-500/15 text-emerald-400' },
  medium: { label: 'Medium confidence', className: 'bg-sky-500/15 text-sky-400' },
  low: { label: 'Low confidence', className: 'bg-amber-500/15 text-amber-400' },
  none: { label: 'No HR data', className: 'bg-slate-500/20 text-slate-400' },
}

export function WorkoutTimelinePage() {
  const { workoutId } = useParams<{ workoutId: string }>()
  const { units } = useUnits()
  const data = useWorkoutTimeline(workoutId)
  const { loading, workout, matchedActivity, timeline, readiness, hrSource } = data
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

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
        <BackLink />
        <Card className="text-center text-[var(--text-secondary)]">Workout not found.</Card>
      </div>
    )
  }

  const title = workout.title || (workout.split !== 'custom' ? SPLIT_NAMES[workout.split] : 'Workout')
  const selected = selectedIndex != null ? (timeline?.sets[selectedIndex] ?? null) : null
  const workingSets = workout.sets.filter((s) => !s.isWarmup)
  const volume = workingSets.reduce((sum, s) => sum + (s.weight ?? 0) * s.reps, 0)

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {new Date(`${workout.day}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })}
          {workout.gym ? ` · ${workout.gym}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <CompareControl workout={workout} />
          {workout.source === 'element26' && (
            <Link to={`/training/strength/workout/${workout.id}/review`} className="mt-2 text-xs text-sky-400 hover:text-sky-300">
              Review import{workout.sets.some((s) => s.editedFields?.length) ? ' (edited)' : ''} →
            </Link>
          )}
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Duration" value={timeline ? duration(timeline.totalMs) : '—'} />
          <Stat label="Exercises" value={`${new Set(workout.sets.map((s) => s.exercise)).size}`} />
          <Stat label="Working sets" value={`${workingSets.length}`} />
          <Stat label="Volume" value={formatWeight(volume, units, 0)} />
          {timeline && (
            <>
              <Stat label="Time in sets" value={duration(timeline.setMs)} sub="estimated" />
              <Stat label="Time resting" value={duration(timeline.restMs)} sub="estimated" />
              <Stat label="Avg HR" value={bpm(timeline.hrAvg)} />
              <Stat label="Peak HR" value={bpm(timeline.hrPeak)} />
            </>
          )}
          {matchedActivity && (
            <>
              <Stat label="Calories" value={matchedActivity.calories != null ? `${matchedActivity.calories}` : '—'} sub="Garmin" />
              <Stat label="Training load" value={matchedActivity.training_load != null ? matchedActivity.training_load.toFixed(1) : '—'} sub="Garmin" />
              <Stat label="Training effect" value={matchedActivity.training_effect != null ? matchedActivity.training_effect.toFixed(1) : '—'} sub="Garmin" />
            </>
          )}
        </div>
      </Card>

      {data.offsetSuggestion && (
        <Card className="border-amber-400/30 text-sm">
          <p className="font-semibold">Times look shifted — probably a time-zone difference</p>
          <p className="mt-1 text-[var(--text-secondary)]">
            Your logged times don't overlap any Garmin strength activity, but they line up with one recorded at{' '}
            {data.offsetSuggestion.activity.start_time?.slice(11, 16)} if shifted by{' '}
            <b>{data.offsetSuggestion.offsetMs > 0 ? '+' : '−'}{Math.abs(data.offsetSuggestion.offsetMs) / 3_600_000}h</b> (
            {Math.round(data.offsetSuggestion.overlap * 100)}% overlap).
          </p>
          <div className="mt-2 flex gap-3 text-xs">
            <button type="button" className="text-sky-400 hover:text-sky-300" onClick={() => data.setClockOffset(data.clockOffsetMs + data.offsetSuggestion!.offsetMs)}>
              Apply shift
            </button>
            <span className="text-[var(--text-tertiary)]">You can undo it in Data quality below.</span>
          </div>
        </Card>
      )}

      {!timeline && (
        <Card className="text-sm text-[var(--text-secondary)]">
          {workout.startedAtEpochMs == null
            ? "This workout was logged without timestamps, so there's no timeline — only sets, reps and weight."
            : "None of this workout's sets carry a timestamp, so a timeline can't be built."}
        </Card>
      )}

      {timeline && (
        <>
          <TimelineCard
            timeline={timeline}
            hrSource={hrSource}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onBoundaryDrag={(i, which, ms) => {
              // Same rule as the nudges and sliders: only the dragged boundary becomes a correction.
              const a = timeline.sets[i]
              const start = which === 'start' ? ms : a.startSource === 'corrected' ? a.startMs : null
              const end = which === 'end' ? ms : a.endSource === 'corrected' ? a.endMs : null
              if ((start ?? a.startMs) >= (end ?? a.endMs) - 1000) return
              data.correctSet(a.set.id, start != null ? start - data.clockOffsetMs : null, end != null ? end - data.clockOffsetMs : null)
            }}
          />

          {selected && selectedIndex != null && (
            <SetPanel
              analysis={selected}
              index={selectedIndex}
              timeline={timeline}
              units={units}
              previous={data.previousByExercise.get(selected.set.exercise) ?? null}
              clockOffsetMs={data.clockOffsetMs}
              onCorrect={data.correctSet}
              onSelect={setSelectedIndex}
              onClose={() => setSelectedIndex(null)}
            />
          )}

          <ExerciseBreakdown timeline={timeline} units={units} selectedIndex={selectedIndex} onSelect={setSelectedIndex} previous={data.previousByExercise} />

          <EffortBands bandsMs={timeline.effortBandsMs} />
        </>
      )}

      {readiness && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Context that day</p>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {readiness.sleepScore != null && <Pair label="Sleep score" value={`${readiness.sleepScore}`} />}
            {readiness.sleepTotalMinutes != null && (
              <Pair label="Sleep" value={`${Math.floor(readiness.sleepTotalMinutes / 60)}h ${Math.round(readiness.sleepTotalMinutes % 60)}m`} />
            )}
            {readiness.restingHr != null && <Pair label="Resting HR" value={`${readiness.restingHr} bpm`} />}
            {readiness.hrvLastNightAvg != null && <Pair label="HRV (night avg)" value={`${readiness.hrvLastNightAvg} ms`} />}
            {readiness.hrvStatus != null && <Pair label="HRV status" value={readiness.hrvStatus} />}
            {readiness.bodyBatteryMin != null && readiness.bodyBatteryMax != null && (
              <Pair label="Body Battery" value={`${readiness.bodyBatteryMin}–${readiness.bodyBatteryMax}`} />
            )}
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Shown for context only — no conclusion is drawn from a single day.</p>
        </Card>
      )}

      {timeline && <DataQualityCard timeline={timeline} hrSource={hrSource} clockOffsetMs={data.clockOffsetMs} onOffset={data.setClockOffset} />}
    </div>
  )
}

function CompareControl({ workout }: { workout: WorkoutWithSets }) {
  const navigate = useNavigate()
  const [options, setOptions] = useState<{ w: WorkoutWithSets; shared: number }[]>([])
  useEffect(() => {
    const mine = new Set(workout.sets.map((s) => s.exercise))
    getAllWorkoutsWithSets().then((all) =>
      setOptions(
        all
          .filter((w) => w.id !== workout.id)
          .map((w) => ({ w, shared: new Set(w.sets.filter((s) => mine.has(s.exercise)).map((s) => s.exercise)).size }))
          .filter((o) => o.shared > 0)
          .sort((a, b) => b.shared - a.shared || (a.w.day < b.w.day ? 1 : -1))
          .slice(0, 20),
      ),
    )
  }, [workout])
  if (options.length === 0) return null
  return (
    <select
      aria-label="Compare with another workout"
      value=""
      onChange={(e) => e.target.value && navigate(`/training/strength/compare/${workout.id}/${e.target.value}`)}
      className="mt-2 rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1 text-xs text-[var(--text-secondary)]"
    >
      <option value="">Compare with…</option>
      {options.map(({ w, shared }) => (
        <option key={w.id} value={w.id}>
          {new Date(`${w.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {w.title || (w.split !== 'custom' ? SPLIT_NAMES[w.split] : 'Workout')} ({shared} shared)
        </option>
      ))}
    </select>
  )
}

function BackLink() {
  return (
    <Link to="/training/strength" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
      ← Back to Strength
    </Link>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-panel)] p-3">
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  )
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}

function SetPanel({
  analysis,
  index,
  timeline,
  units,
  previous,
  clockOffsetMs,
  onCorrect,
  onSelect,
  onClose,
}: {
  analysis: SetAnalysis
  index: number
  timeline: WorkoutTimeline
  units: ReturnType<typeof useUnits>['units']
  previous: PreviousExerciseSession | null
  clockOffsetMs: number
  onCorrect: (setId: string, startMs: number | null, endMs: number | null) => Promise<void>
  onSelect: (i: number | null) => void
  onClose: () => void
}) {
  const { set } = analysis
  const conf = CONFIDENCE_STYLE[analysis.confidence]
  const rest = analysis.restAfter
  const prevSet = previous?.sets.filter((s) => s.isWarmup === set.isWarmup)[positionAmongSameKind(timeline, index)] ?? null

  // Corrections are stored in the logger's own clock; the timeline shows watch time (logger + offset).
  // Only the boundary being nudged becomes a correction; the other keeps its existing correction (or none).
  const nudge = (which: 'start' | 'end', deltaMs: number) => {
    const start = which === 'start' ? analysis.startMs + deltaMs : analysis.startSource === 'corrected' ? analysis.startMs : null
    const end = which === 'end' ? analysis.endMs + deltaMs : analysis.endSource === 'corrected' ? analysis.endMs : null
    onCorrect(set.id, start != null ? start - clockOffsetMs : null, end != null ? end - clockOffsetMs : null)
  }
  const isCorrected = analysis.startSource === 'corrected' || analysis.endSource === 'corrected'

  return (
    <Card className="border-rose-400/30">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {set.exercise} — set {analysis.setNumberInExercise}
            {set.setType && set.setType !== 'working' ? ` (${set.setType})` : ''}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {clock(analysis.startMs)} – {clock(analysis.endMs)} · {duration(analysis.durationMs)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${conf.className}`}>{conf.label}</span>
          <button type="button" onClick={onClose} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            Close
          </button>
        </div>
      </div>

      <Section title="Performance">
        <Stat label="Load" value={formatWeight(set.weight, units, 1)} />
        <Stat label="Reps" value={`${set.reps}`} />
        <Stat label="Volume" value={analysis.volumeKg != null ? formatWeight(analysis.volumeKg, units, 0) : '—'} />
        <Stat label="RPE" value={set.rpe != null ? `${set.rpe}` : '—'} sub={set.rir != null ? `${set.rir} RIR` : undefined} />
      </Section>

      <Section
        title="Heart-rate response"
        info={`Before = average over the ${PRE_SET_WINDOW_MS / 1000}s before the set's start. Avg/peak/end use only samples inside the set window. Heart rate reflects cardiovascular load — not muscular fatigue, effort, or closeness to failure.`}
      >
        <Stat label="Before" value={bpm(analysis.preSetHr)} />
        <Stat label="Average" value={bpm(analysis.stats.avg)} />
        <Stat label="Peak" value={bpm(analysis.stats.peak)} />
        <Stat label="At end" value={bpm(analysis.stats.last)} sub={analysis.hrChange != null ? `${analysis.hrChange >= 0 ? '+' : ''}${analysis.hrChange} over set` : undefined} />
      </Section>
      <p className="-mt-1 mb-3 text-[11px] text-[var(--text-tertiary)]">
        {analysis.stats.n} samples · {Math.round(analysis.stats.coverage * 100)}% of the set covered
      </p>

      {rest && (
        <Section
          title={`Rest after · ${duration(rest.durationMs)}`}
          info={`Measured from this set's end. Checkpoint values are the nearest sample within 5s — never interpolated. "Back near pre-set" = first sample at or below this set's pre-set HR + ${RETURN_MARGIN_BPM} bpm. Heart rate lags effort, so early-rest values partly reflect the set itself. This is not a clinical HR-recovery test.`}
        >
          <Stat label="At rest start" value={bpm(rest.hrAtStart)} />
          {rest.checkpoints.map((c) => (
            <Stat key={c.seconds} label={`After ${c.seconds}s`} value={bpm(c.hr)} />
          ))}
          <Stat label="Drop in 60s" value={rest.drop60 != null ? `${rest.drop60} bpm` : '—'} />
          <Stat
            label="Back near pre-set"
            value={rest.secondsToReturn != null ? `${rest.secondsToReturn}s` : rest.returnTarget != null ? 'not within rest' : '—'}
            sub={rest.returnTarget != null ? `≤ ${rest.returnTarget} bpm` : undefined}
          />
        </Section>
      )}

      <Section title="Previous session">
        {previous && prevSet ? (
          <>
            <Stat label={new Date(`${previous.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} value={`${formatWeight(prevSet.weight, units, 1)} × ${prevSet.reps}`} />
            <Stat
              label="Change"
              value={diffLabel(set.weight, prevSet.weight, set.reps, prevSet.reps, units)}
              sub="same set position"
            />
          </>
        ) : (
          <p className="col-span-full text-sm text-[var(--text-tertiary)]">No earlier session of {set.exercise} with a matching set.</p>
        )}
      </Section>

      <div className="mt-1 rounded-xl bg-[var(--bg-panel)] p-3 text-xs text-[var(--text-secondary)]">
        <p>
          Start: <b>{SOURCE_LABELS[analysis.startSource]}</b> · End: <b>{SOURCE_LABELS[analysis.endSource]}</b>
        </p>
        {analysis.issues.map((issue, i) => (
          <p key={i} className="mt-1 text-amber-400">
            {issue}
          </p>
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[var(--text-tertiary)]">Adjust start</span>
          <NudgeButton onClick={() => nudge('start', -5000)}>−5s</NudgeButton>
          <NudgeButton onClick={() => nudge('start', 5000)}>+5s</NudgeButton>
          <span className="ml-2 text-[var(--text-tertiary)]">end</span>
          <NudgeButton onClick={() => nudge('end', -5000)}>−5s</NudgeButton>
          <NudgeButton onClick={() => nudge('end', 5000)}>+5s</NudgeButton>
          {isCorrected && (
            <button type="button" className="ml-2 text-rose-400 hover:text-rose-300" onClick={() => onCorrect(set.id, null, null)}>
              Reset to imported
            </button>
          )}
        </div>
        <BoundaryEditor
          key={`${set.id}-${analysis.startMs}-${analysis.endMs}`}
          analysis={analysis}
          lower={index > 0 ? timeline.sets[index - 1].endMs : timeline.windowStart}
          upper={index < timeline.sets.length - 1 ? timeline.sets[index + 1].startMs : timeline.windowEnd}
          windowStart={timeline.windowStart}
          windowEnd={timeline.windowEnd}
          onSave={(start, end) => {
            // Only a boundary that moved (or was already corrected) becomes a correction.
            const keepStart = start !== analysis.startMs || analysis.startSource === 'corrected'
            const keepEnd = end !== analysis.endMs || analysis.endSource === 'corrected'
            onCorrect(set.id, keepStart ? start - clockOffsetMs : null, keepEnd ? end - clockOffsetMs : null)
          }}
        />
        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">Corrections are stored separately — the imported file is never changed.</p>
      </div>

      <div className="mt-3 flex justify-between text-xs">
        <button type="button" disabled={index === 0} className="text-sky-400 disabled:opacity-30" onClick={() => onSelect(index - 1)}>
          ← Previous set
        </button>
        <button type="button" disabled={index >= timeline.sets.length - 1} className="text-sky-400 disabled:opacity-30" onClick={() => onSelect(index + 1)}>
          Next set →
        </button>
      </div>
    </Card>
  )
}

/** Zero-based position of this set among earlier sets of the same exercise and kind (warm-up vs working). */
/** Slider editor for a set's boundaries. Times shown in watch time; saved in the logger's clock by the caller. */
function BoundaryEditor({
  analysis,
  lower,
  upper,
  windowStart,
  windowEnd,
  onSave,
}: {
  analysis: SetAnalysis
  lower: number
  upper: number
  windowStart: number
  windowEnd: number
  onSave: (start: number, end: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(analysis.startMs)
  const [end, setEnd] = useState(analysis.endMs)
  // A little room past the neighbours, so an obviously wrong estimate can be pulled into place.
  const min = Math.max(windowStart, Math.min(lower, analysis.startMs) - 60_000)
  const max = Math.min(windowEnd, Math.max(upper, analysis.endMs) + 60_000)
  const changed = start !== analysis.startMs || end !== analysis.endMs
  if (!open) {
    return (
      <button type="button" className="mt-2 text-sky-400 hover:text-sky-300" onClick={() => setOpen(true)}>
        Edit boundaries with sliders
      </button>
    )
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <label className="flex items-center gap-2">
        <span className="w-10 text-[var(--text-tertiary)]">Start</span>
        <input type="range" min={min} max={end - 1000} step={1000} value={start} onChange={(e) => setStart(Number(e.target.value))} className="flex-1 accent-rose-400" aria-label="Set start" />
        <span className="w-20 text-right tabular-nums">{clock(start)}</span>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-10 text-[var(--text-tertiary)]">End</span>
        <input type="range" min={start + 1000} max={max} step={1000} value={end} onChange={(e) => setEnd(Number(e.target.value))} className="flex-1 accent-rose-400" aria-label="Set end" />
        <span className="w-20 text-right tabular-nums">{clock(end)}</span>
      </label>
      <p className="text-[var(--text-tertiary)]">
        {duration(end - start)}
        {start < lower ? ' · overlaps the previous set' : ''}
        {end > upper ? ' · overlaps the next set' : ''}
      </p>
      <div className="flex gap-3">
        <button type="button" disabled={!changed} className="text-sky-400 disabled:opacity-40" onClick={() => onSave(start, end)}>
          Save
        </button>
        <button type="button" className="text-[var(--text-tertiary)]" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function positionAmongSameKind(timeline: WorkoutTimeline, index: number): number {
  const { exercise, isWarmup } = timeline.sets[index].set
  return timeline.sets.slice(0, index).filter((s) => s.set.exercise === exercise && s.set.isWarmup === isWarmup).length
}

function diffLabel(w: number | null, pw: number | null, r: number, pr: number, units: ReturnType<typeof useUnits>['units']): string {
  const parts: string[] = []
  if (w != null && pw != null && Math.abs(w - pw) >= 0.01) parts.push(`${w > pw ? '+' : '−'}${formatWeight(Math.abs(w - pw), units, 1)}`)
  if (r !== pr) parts.push(`${r > pr ? '+' : '−'}${Math.abs(r - pr)} reps`)
  return parts.length > 0 ? parts.join(', ') : 'Same'
}

function Section({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{title}</p>
        {info && <InfoButton title={title}>{info}</InfoButton>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </div>
  )
}

function NudgeButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-[var(--border-panel)] px-2 py-1 tabular-nums hover:bg-[var(--bg-panel)]">
      {children}
    </button>
  )
}

function ExerciseBreakdown({
  timeline,
  units,
  selectedIndex,
  onSelect,
  previous,
}: {
  timeline: WorkoutTimeline
  units: ReturnType<typeof useUnits>['units']
  selectedIndex: number | null
  onSelect: (i: number) => void
  previous: Map<string, PreviousExerciseSession>
}) {
  const groups = new Map<string, { s: SetAnalysis; i: number }[]>()
  timeline.sets.forEach((s, i) => {
    const list = groups.get(s.set.exercise) ?? []
    list.push({ s, i })
    groups.set(s.set.exercise, list)
  })

  return (
    <Card>
      <p className="mb-3 font-semibold">Sets</p>
      <div className="flex flex-col gap-4">
        {Array.from(groups.entries()).map(([exercise, rows]) => {
          const prev = previous.get(exercise)
          return (
            <div key={exercise}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{exercise}</p>
                {prev && (
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    last: {new Date(`${prev.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
                    {prev.sets.filter((x) => !x.isWarmup).map((x) => `${formatWeight(x.weight, units, 0)}×${x.reps}`).join(', ')}
                  </p>
                )}
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[var(--text-tertiary)]">
                    <th className="py-1 pr-2 font-medium">Set</th>
                    <th className="py-1 pr-2 font-medium">Load × reps</th>
                    <th className="py-1 pr-2 font-medium">Avg / peak</th>
                    <th className="py-1 pr-2 font-medium">Rest</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ s, i }) => (
                    <tr
                      key={s.set.id}
                      onClick={() => onSelect(i)}
                      className={`cursor-pointer border-t border-[var(--border-panel)] ${i === selectedIndex ? 'bg-rose-500/10' : 'hover:bg-[var(--bg-panel)]'}`}
                    >
                      <td className="py-1.5 pr-2">
                        {s.setNumberInExercise}
                        {s.set.isWarmup ? ' WU' : ''}
                        {s.set.setType === 'drop' && <span className="ml-1 rounded bg-orange-500/15 px-1 text-[10px] text-orange-400">drop</span>}
                        {s.supersetGroup != null && <span className="ml-1 rounded bg-violet-500/15 px-1 text-[10px] text-violet-400">SS{s.supersetGroup}</span>}
                        {s.set.editedFields?.length ? <span className="ml-1 text-[10px] text-sky-400" title="Edited in review">✎</span> : null}
                        {s.confidence === 'low' || s.confidence === 'none' ? <span className="ml-1 text-amber-400">•</span> : null}
                      </td>
                      <td className="py-1.5 pr-2">
                        {formatWeight(s.set.weight, units, 1)} × {s.set.reps}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">{s.stats.avg != null ? `${s.stats.avg} / ${s.stats.peak}` : '—'}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{s.restAfter ? duration(s.restAfter.durationMs) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">Tap a row to inspect it. • = low confidence or no HR samples for that set.</p>
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
          Time at each band of heart rate relative to this session's own peak — a self-comparison, not an age-based zone system.
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
              {label}: {duration(bandsMs[i])}
            </span>
          ) : null,
        )}
      </div>
    </Card>
  )
}

function DataQualityCard({
  timeline,
  hrSource,
  clockOffsetMs,
  onOffset,
}: {
  timeline: WorkoutTimeline
  hrSource: HrSource
  clockOffsetMs: number
  onOffset: (ms: number) => Promise<void>
}) {
  const q = timeline.quality
  const offsetLabel = clockOffsetMs === 0 ? 'none' : `${clockOffsetMs > 0 ? '+' : '−'}${duration(Math.abs(clockOffsetMs))}`
  return (
    <Card>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="font-semibold">Data quality</p>
        <InfoButton title="Data quality">
          How much of this analysis rests on measured data. If every set looks shifted against the heart-rate trace (for example after
          travelling across time zones, or a phone clock that was off), adjust the clock offset — it moves all logged times together.
        </InfoButton>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="HR source" value={hrSource === 'activity' ? 'Watch activity' : hrSource === 'monitoring' ? 'All-day HR' : 'None'} />
        <Stat label="HR coverage" value={`${Math.round(q.hrCoverage * 100)}%`} sub={`${q.sampleCount} samples`} />
        <Stat label="Sample spacing" value={q.medianSampleIntervalMs != null ? `${Math.round(q.medianSampleIntervalMs / 1000)}s` : '—'} sub="median" />
        <Stat label="Estimated starts" value={`${q.estimatedStarts} / ${timeline.sets.length}`} />
      </div>
      {q.issues.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-amber-400">
          {q.issues.map((issue, i) => (
            <li key={i}>• {issue}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[var(--text-tertiary)]">Clock offset: {offsetLabel}</span>
        <NudgeButton onClick={() => onOffset(clockOffsetMs - 3_600_000)}>−1h</NudgeButton>
        <NudgeButton onClick={() => onOffset(clockOffsetMs - 10_000)}>−10s</NudgeButton>
        <NudgeButton onClick={() => onOffset(clockOffsetMs + 10_000)}>+10s</NudgeButton>
        <NudgeButton onClick={() => onOffset(clockOffsetMs + 3_600_000)}>+1h</NudgeButton>
        {clockOffsetMs !== 0 && (
          <button type="button" className="ml-1 text-rose-400 hover:text-rose-300" onClick={() => onOffset(0)}>
            Reset
          </button>
        )}
      </div>
    </Card>
  )
}
