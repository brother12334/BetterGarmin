import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { EChartsOption } from 'echarts'
import { Card } from '../../components/ui/Card'
import { Chart } from '../../components/ui/Chart'
import { InfoButton } from '../../components/ui/InfoButton'
import { Skeleton } from '../../components/ui/Skeleton'
import { useData } from '../../app/DataProvider'
import { useUnits } from '../../app/units'
import { formatWeight } from '../../lib/units'
import { getSleep, getRestingHrRange } from '../../db/queries'
import { getWorkoutWithSets, type SetRecord, type WorkoutWithSets } from '../../db/strengthLog'
import { SPLIT_NAMES } from '../../lib/strengthPlans'
import { estimateOneRepMax } from '../../lib/strength'
import { hmsToMinutes } from '../../lib/duration'
import { loadWorkoutAnalysis, type WorkoutAnalysis } from './loadWorkoutAnalysis'
import type { SetAnalysis } from './workoutTimeline'
import { duration } from './timelineUi'

interface Side {
  workout: WorkoutWithSets
  analysis: WorkoutAnalysis
  sleepMinutes: number | null
  restingHr: number | null
}

const COLORS = ['#38bdf8', '#f5a623']

async function loadSide(id: string, kinds: Parameters<typeof loadWorkoutAnalysis>[1]): Promise<Side | null> {
  const workout = await getWorkoutWithSets(id)
  if (!workout) return null
  const analysis = await loadWorkoutAnalysis(workout, kinds)
  let sleepMinutes: number | null = null
  let restingHr: number | null = null
  if (kinds.includes('garmin')) {
    const [sleep, rhr] = await Promise.all([getSleep(workout.day), getRestingHrRange(workout.day, workout.day)])
    sleepMinutes = sleep ? hmsToMinutes(sleep.total_sleep) : null
    restingHr = rhr[0]?.resting_heart_rate ?? null
  }
  return { workout, analysis, sleepMinutes, restingHr }
}

const titleOf = (w: WorkoutWithSets) => w.title || (w.split !== 'custom' ? SPLIT_NAMES[w.split] : 'Workout')
const dateOf = (w: WorkoutWithSets) => new Date(`${w.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function CompareWorkoutsPage() {
  const { a, b } = useParams<{ a: string; b: string }>()
  const { loadedKinds } = useData()
  const { units } = useUnits()
  const [sides, setSides] = useState<[Side, Side] | null | 'missing'>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([loadSide(a!, loadedKinds), loadSide(b!, loadedKinds)]).then(([x, y]) => {
      if (cancelled) return
      if (!x || !y) return setSides('missing')
      // Earlier workout first, so every "Change" reads as earlier → later.
      const later = (p: Side, q: Side) => p.workout.day > q.workout.day || (p.workout.day === q.workout.day && (p.workout.startedAtEpochMs ?? p.workout.createdAt) > (q.workout.startedAtEpochMs ?? q.workout.createdAt))
      setSides(later(x, y) ? [y, x] : [x, y])
    })
    return () => {
      cancelled = true
    }
  }, [a, b, loadedKinds])

  const rows = useMemo(() => (sides && sides !== 'missing' ? alignExercises(sides[0], sides[1]) : null), [sides])

  if (sides == null) return <Skeleton className="h-64 w-full" />
  if (sides === 'missing') return <Card className="text-center text-[var(--text-secondary)]">One of these workouts no longer exists.</Card>
  const [A, B] = sides

  const limitations: string[] = []
  if (rows!.onlyA.length) limitations.push(`Only in ${dateOf(A.workout)}: ${rows!.onlyA.join(', ')}.`)
  if (rows!.onlyB.length) limitations.push(`Only in ${dateOf(B.workout)}: ${rows!.onlyB.join(', ')}.`)
  if (rows!.orderChanged) limitations.push('Shared exercises were done in a different order — later exercises are usually affected by earlier fatigue.')
  if (A.analysis.hrSource !== B.analysis.hrSource) limitations.push('Heart rate comes from different sources (watch activity vs. all-day monitoring), so HR detail is not equally precise.')
  const est = (x: Side) => x.analysis.timeline?.quality.estimatedStarts ?? 0
  if (est(A) + est(B) > 0) limitations.push('Set durations, rests and per-set HR rely on estimated set starts unless corrected.')

  const stat = (x: Side) => {
    const working = x.workout.sets.filter((s) => !s.isWarmup)
    return {
      duration: x.analysis.timeline ? duration(x.analysis.timeline.totalMs) : '—',
      sets: `${working.length}`,
      volume: formatWeight(working.reduce((s, w) => s + (w.weight ?? 0) * w.reps, 0), units, 0),
      avgHr: x.analysis.timeline?.hrAvg != null ? `${x.analysis.timeline.hrAvg} bpm` : '—',
      sleep: x.sleepMinutes != null ? `${Math.floor(x.sleepMinutes / 60)}h ${Math.round(x.sleepMinutes % 60)}m` : '—',
      rhr: x.restingHr != null ? `${x.restingHr} bpm` : '—',
    }
  }
  const sa = stat(A)
  const sb = stat(B)

  const hrOption: EChartsOption | null =
    A.analysis.timeline && B.analysis.timeline && A.analysis.timeline.hrSeries.length && B.analysis.timeline.hrSeries.length
      ? {
          grid: { left: 8, right: 12, top: 24, bottom: 24, containLabel: true },
          legend: { top: 0, textStyle: { color: 'var(--text-tertiary)', fontSize: 11 } },
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'value', name: 'min', axisLabel: { color: 'var(--text-tertiary)' }, splitLine: { show: false } },
          yAxis: { type: 'value', scale: true, name: 'bpm', axisLabel: { color: 'var(--text-tertiary)' }, splitLine: { lineStyle: { color: 'var(--border-panel)' } } },
          series: [A, B].map((x, i) => ({
            name: dateOf(x.workout),
            type: 'line' as const,
            showSymbol: false,
            sampling: 'lttb' as const,
            lineStyle: { color: COLORS[i], width: 1.3 },
            itemStyle: { color: COLORS[i] },
            data: x.analysis.timeline!.hrSeries.map((p) => [Math.round(((p.t - x.analysis.timeline!.windowStart) / 60000) * 100) / 100, p.v]),
          })),
        }
      : null

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/training/strength/workout/${a}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        ← Back to workout
      </Link>
      <h1 className="text-2xl font-bold">Compare workouts</h1>

      <Card>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--text-tertiary)]">
              <th className="py-1 font-medium" />
              {[A, B].map((x, i) => (
                <th key={i} className="py-1 font-medium">
                  <Link to={`/training/strength/workout/${x.workout.id}`} style={{ color: COLORS[i] }}>
                    {titleOf(x.workout)}
                    <br />
                    {dateOf(x.workout)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {(
              [
                ['Duration', sa.duration, sb.duration],
                ['Working sets', sa.sets, sb.sets],
                ['Volume', sa.volume, sb.volume],
                ['Avg HR', sa.avgHr, sb.avgHr],
                ['Sleep before', sa.sleep, sb.sleep],
                ['Resting HR that day', sa.rhr, sb.rhr],
              ] as const
            ).map(([label, x, y]) => (
              <tr key={label} className="border-t border-[var(--border-panel)]">
                <td className="py-1.5 text-xs text-[var(--text-tertiary)]">{label}</td>
                <td className="py-1.5">{x}</td>
                <td className="py-1.5">{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {hrOption && (
        <Card>
          <div className="mb-1 flex items-center gap-1.5">
            <p className="font-semibold">Heart rate, minutes from start</p>
            <InfoButton title="Overlay">Both sessions on the same scale, aligned at their start. Different exercise order or rest lengths shift the shapes.</InfoButton>
          </div>
          <Chart option={hrOption} height={220} />
        </Card>
      )}

      {rows!.shared.map((r) => (
        <Card key={r.exercise}>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="font-semibold">{r.exercise}</p>
            {r.e1rm[0] != null && r.e1rm[1] != null && (
              <p className="text-xs text-[var(--text-tertiary)]">
                best e1RM {formatWeight(r.e1rm[0], units, 1)} → {formatWeight(r.e1rm[1], units, 1)}
              </p>
            )}
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-tertiary)]">
                <th className="py-1 pr-2 font-medium">Set</th>
                <th className="py-1 pr-2 font-medium" style={{ color: COLORS[0] }}>
                  Load × reps · HR
                </th>
                <th className="py-1 pr-2 font-medium" style={{ color: COLORS[1] }}>
                  Load × reps · HR
                </th>
                <th className="py-1 font-medium">Earlier → later</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.pairs.map((p, i) => (
                <tr key={i} className="border-t border-[var(--border-panel)]">
                  <td className="py-1.5 pr-2">
                    {p.label}
                  </td>
                  <td className="py-1.5 pr-2">{cell(p.a, p.aa, units)}</td>
                  <td className="py-1.5 pr-2">{cell(p.b, p.ba, units)}</td>
                  <td className="py-1.5">{p.a && p.b ? change(p.a, p.b, units) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      <Card>
        <p className="mb-1 font-semibold">What limits this comparison</p>
        {limitations.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Same exercises in the same order with measured boundaries — a fair like-for-like comparison.</p>
        ) : (
          <ul className="list-disc pl-4 text-sm text-[var(--text-secondary)]">
            {limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function cell(s: SetRecord | null, a: SetAnalysis | null, units: ReturnType<typeof useUnits>['units']) {
  if (!s) return <span className="text-[var(--text-tertiary)]">—</span>
  return (
    <>
      {formatWeight(s.weight, units, 1)} × {s.reps}
      {a?.stats.peak != null && <span className="text-[var(--text-tertiary)]"> · peak {a.stats.peak}</span>}
      {a?.restAfter && <span className="text-[var(--text-tertiary)]"> · rest {duration(a.restAfter.durationMs)}</span>}
    </>
  )
}

function change(a: SetRecord, b: SetRecord, units: ReturnType<typeof useUnits>['units']) {
  const parts: string[] = []
  if (a.weight != null && b.weight != null && Math.abs(b.weight - a.weight) >= 0.01) parts.push(`${b.weight > a.weight ? '+' : '−'}${formatWeight(Math.abs(b.weight - a.weight), units, 1)}`)
  if (a.reps !== b.reps) parts.push(`${b.reps > a.reps ? '+' : '−'}${Math.abs(b.reps - a.reps)} reps`)
  return parts.join(', ') || 'same'
}

interface PairRow {
  label: string
  a: SetRecord | null
  b: SetRecord | null
  aa: SetAnalysis | null
  ba: SetAnalysis | null
}

/** Matches exercises by name and sets by position among sets of the same kind (warm-ups with warm-ups, working with working). */
function alignExercises(A: Side, B: Side) {
  const order = (w: WorkoutWithSets) => [...new Set([...w.sets].sort((x, y) => x.order - y.order).map((s) => s.exercise))]
  const oa = order(A.workout)
  const ob = order(B.workout)
  const shared = oa.filter((e) => ob.includes(e))
  const analysisBySet = (x: Side) => new Map((x.analysis.timeline?.sets ?? []).map((s) => [s.set.id, s]))
  const ma = analysisBySet(A)
  const mb = analysisBySet(B)
  const best = (sets: SetRecord[]) => sets.reduce<number | null>((m, s) => (s.isWarmup || s.weight == null ? m : Math.max(m ?? 0, estimateOneRepMax(s.weight, s.reps))), null)

  return {
    onlyA: oa.filter((e) => !ob.includes(e)),
    onlyB: ob.filter((e) => !oa.includes(e)),
    orderChanged: shared.join('|') !== ob.filter((e) => oa.includes(e)).join('|'),
    shared: shared.map((exercise) => {
      const sa = A.workout.sets.filter((s) => s.exercise === exercise).sort((x, y) => x.order - y.order)
      const sb = B.workout.sets.filter((s) => s.exercise === exercise).sort((x, y) => x.order - y.order)
      const pairs: PairRow[] = []
      for (const warm of [true, false]) {
        const xa = sa.filter((s) => s.isWarmup === warm)
        const xb = sb.filter((s) => s.isWarmup === warm)
        for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
          pairs.push({ label: `${warm ? 'WU ' : ''}${i + 1}`, a: xa[i] ?? null, b: xb[i] ?? null, aa: xa[i] ? (ma.get(xa[i].id) ?? null) : null, ba: xb[i] ? (mb.get(xb[i].id) ?? null) : null })
        }
      }
      return { exercise, pairs, e1rm: [best(sa), best(sb)] as [number | null, number | null] }
    }),
  }
}
