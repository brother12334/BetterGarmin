import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Chart } from '../../components/ui/Chart'
import { InfoButton } from '../../components/ui/InfoButton'
import { Skeleton } from '../../components/ui/Skeleton'
import { TrophyIcon } from '../../app/icons'
import { MUSCLE_GROUPS, MUSCLE_GROUP_COLORS, MUSCLE_GROUP_LABELS } from '../../lib/strength'
import { EXERCISE_CATALOG, SPLIT_NAMES } from '../../lib/strengthPlans'
import { useStrengthLog } from './useStrengthLog'
import { useStrengthSessions } from './useStrengthSessions'
import { LogWorkoutForm } from './LogWorkoutForm'
import { ImportElement26Button } from './ImportElement26Button'
import { formatHoursMinutes, hmsToMinutes } from '../../lib/duration'
import {
  computePRs,
  computePrEvents,
  computeRecentMuscleBalance,
  computeStreak,
  computeWeeklyVolume,
  setsForExercise,
} from './strengthStats'
import type { WorkoutWithSets } from '../../db/strengthLog'

const BALANCE_WINDOW_DAYS = 28
const SESSIONS_PAGE_SIZE = 15

export function StrengthPage() {
  const { workouts, loading, save, remove, clearAll } = useStrengthLog()
  const { sessions, loading: sessionsLoading } = useStrengthSessions(workouts)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WorkoutWithSets | null>(null)
  const [exercise, setExercise] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [visibleSessions, setVisibleSessions] = useState(SESSIONS_PAGE_SIZE)

  const prs = useMemo(() => computePRs(workouts), [workouts])
  const prEvents = useMemo(() => computePrEvents(workouts), [workouts])
  const weeklyVolume = useMemo(() => computeWeeklyVolume(workouts).slice(-12), [workouts])
  const streak = useMemo(() => computeStreak(workouts), [workouts])
  const balance = useMemo(() => computeRecentMuscleBalance(workouts, BALANCE_WINDOW_DAYS), [workouts])

  const exerciseOptions = useMemo(() => {
    const logged = new Set(workouts.flatMap((w) => w.sets.map((s) => s.exercise)))
    return EXERCISE_CATALOG.filter((e) => logged.has(e.name)).map((e) => e.name)
  }, [workouts])
  const selectedExercise = exercise && exerciseOptions.includes(exercise) ? exercise : (exerciseOptions[0] ?? null)
  const exerciseProgression = useMemo(
    () => (selectedExercise ? setsForExercise(workouts, selectedExercise) : []),
    [workouts, selectedExercise],
  )

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link to="/training" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            ← Training
          </Link>
          <h1 className="text-2xl font-bold">Strength</h1>
        </div>
        {!formOpen && (
          <div className="flex items-center gap-2">
            <ImportElement26Button onImported={save} />
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              Log workout
            </Button>
          </div>
        )}
      </div>

      {formOpen && (
        <Card>
          <p className="mb-3 font-semibold">{editing ? 'Edit workout' : 'Log a workout'}</p>
          <LogWorkoutForm
            existing={editing ?? undefined}
            onCancel={() => setFormOpen(false)}
            onSave={async (workout, sets) => {
              await save(workout, sets)
              setFormOpen(false)
              setEditing(null)
            }}
          />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="This week" value={`${streak.sessionsThisWeek}`} sublabel="sessions" />
        <StatTile label="Week streak" value={`${streak.currentWeekStreak}`} sublabel={streak.currentWeekStreak === 1 ? 'week' : 'weeks'} />
        <StatTile label="Exercises tracked" value={`${prs.length}`} sublabel="with a PR" />
        <StatTile label="Logged workouts" value={`${workouts.length}`} sublabel="total" />
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-1.5">
          <TrophyIcon width={18} height={18} className="text-amber-400" />
          <p className="font-semibold">Personal records</p>
          <InfoButton title="Personal records">
            Your best estimated one-rep max per exercise (Epley formula: weight × (1 + reps ÷ 30)), from your
            heaviest working set logged for that exercise.
          </InfoButton>
        </div>
        {prs.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Log a workout to start tracking PRs.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {prs.slice(0, 9).map((pr) => (
              <div key={pr.exercise} className="rounded-xl p-3" style={{ backgroundColor: `${MUSCLE_GROUP_COLORS[pr.category]}14` }}>
                <p className="truncate text-xs text-[var(--text-tertiary)]">{pr.exercise}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{Math.round(pr.e1rm)} kg</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  e1RM · {pr.weight}kg × {pr.reps}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {prEvents.length > 0 && (
        <Card>
          <p className="mb-2 font-semibold">Recent PRs</p>
          <ul className="flex flex-col gap-2">
            {prEvents.slice(0, 5).map((e, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <TrophyIcon width={14} height={14} className="shrink-0 text-amber-400" />
                  {e.exercise}
                </span>
                <span className="text-[var(--text-secondary)]">
                  {Math.round(e.e1rm)} kg e1RM <span className="text-[var(--text-tertiary)]">(+{Math.round(e.improvementKg)})</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {weeklyVolume.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center gap-1.5">
            <p className="font-semibold">Weekly volume</p>
            <InfoButton title="Training volume">
              Total weight × reps lifted per week across working sets (warmups excluded), broken down by muscle
              group. A rough proxy for how much work you're putting in.
            </InfoButton>
          </div>
          <Chart
            option={{
              grid: { left: 36, right: 12, top: 48, bottom: 28, containLabel: true },
              xAxis: {
                type: 'category',
                data: weeklyVolume.map((w) => new Date(`${w.week}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
                axisLine: { lineStyle: { color: 'var(--border-panel)' } },
                axisLabel: { color: 'var(--text-tertiary)' },
              },
              yAxis: { type: 'value', splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
              legend: { textStyle: { color: 'var(--text-tertiary)', fontSize: 11 }, top: 0, itemWidth: 12, itemHeight: 12 },
              series: MUSCLE_GROUPS.map((g) => ({
                name: MUSCLE_GROUP_LABELS[g],
                type: 'bar',
                stack: 'volume',
                data: weeklyVolume.map((w) => Math.round(w.byCategory[g])),
                itemStyle: { color: MUSCLE_GROUP_COLORS[g] },
              })),
            }}
          />
        </Card>
      )}

      {Object.values(balance).some((v) => v > 0) && (
        <Card>
          <p className="mb-2 font-semibold">Muscle balance</p>
          <p className="mb-2 text-xs text-[var(--text-tertiary)]">Volume by muscle group over the last {BALANCE_WINDOW_DAYS} days</p>
          <Chart
            option={{
              xAxis: {
                type: 'value',
                splitNumber: 4,
                splitLine: { lineStyle: { color: 'var(--border-panel)' } },
                axisLabel: {
                  color: 'var(--text-tertiary)',
                  hideOverlap: true,
                  formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`),
                },
              },
              yAxis: {
                type: 'category',
                data: MUSCLE_GROUPS.map((g) => MUSCLE_GROUP_LABELS[g]),
                axisLine: { lineStyle: { color: 'var(--border-panel)' } },
                axisLabel: { color: 'var(--text-tertiary)' },
              },
              series: [
                {
                  type: 'bar',
                  data: MUSCLE_GROUPS.map((g) => ({ value: Math.round(balance[g]), itemStyle: { color: MUSCLE_GROUP_COLORS[g] } })),
                },
              ],
            }}
            height={200}
          />
        </Card>
      )}

      {exerciseOptions.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-semibold">1RM progression</p>
            <select
              value={selectedExercise ?? ''}
              onChange={(e) => setExercise(e.target.value)}
              className="rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1 text-sm text-[var(--text-primary)]"
            >
              {exerciseOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {exerciseProgression.length > 1 ? (
            <Chart
              option={{
                xAxis: {
                  type: 'time',
                  splitNumber: 4,
                  axisLine: { lineStyle: { color: 'var(--border-panel)' } },
                  axisLabel: { color: 'var(--text-tertiary)', hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) },
                },
                yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
                series: [
                  {
                    type: 'line',
                    data: exerciseProgression.map((p) => [`${p.day}T00:00:00`, p.e1rm]),
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { color: '#a78bfa', width: 2 },
                    areaStyle: { color: 'rgba(167, 139, 250, 0.1)' },
                  },
                ],
              }}
            />
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">Log this exercise a couple more times to see a trend.</p>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <p className="font-semibold">Sessions</p>
        {sessionsLoading && <Skeleton className="h-24 w-full" />}
        {!sessionsLoading && sessions.length === 0 && (
          <Card className="text-center text-[var(--text-secondary)]">No strength sessions yet — log one above.</Card>
        )}
        {sessions.slice(0, visibleSessions).map((s, i) => (
          <Card key={i} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {s.workout
                    ? (s.workout.title ?? (s.workout.split === 'custom' ? 'Workout' : SPLIT_NAMES[s.workout.split]))
                    : (s.activity?.name ?? 'Strength session')}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {new Date(`${s.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  {s.workout ? ` · ${s.workout.sets.filter((x) => !x.isWarmup).length} sets` : ' · no sets logged'}
                </p>
              </div>
              {s.workout && (
                <div className="flex gap-2">
                  {s.workout.startedAtEpochMs != null && (
                    <Link
                      to={`/training/strength/workout/${s.workout.id}`}
                      className="text-xs text-sky-400 hover:text-sky-300"
                    >
                      Timeline
                    </Link>
                  )}
                  <button
                    type="button"
                    className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    onClick={() => {
                      setEditing(s.workout)
                      setFormOpen(true)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-400 hover:text-rose-300"
                    onClick={() => remove(s.workout!.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            {s.activity && (
              <div className="flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
                {s.activity.elapsed_time && <span>{formatHoursMinutes(hmsToMinutes(s.activity.elapsed_time))}</span>}
                {s.activity.avg_hr != null && <span>{s.activity.avg_hr} avg bpm</span>}
                {s.activity.calories != null && <span>{s.activity.calories} cal</span>}
                {s.activity.training_load != null && <span>Load {Math.round(s.activity.training_load)}</span>}
                {s.activity.self_eval_effort != null && <span>Effort {s.activity.self_eval_effort}/5</span>}
              </div>
            )}
            {!s.workout && s.activity && (
              <Button
                variant="ghost"
                className="self-start text-xs"
                onClick={() => {
                  setEditing({
                    id: `new-${s.activity!.activity_id}`,
                    day: s.day,
                    split: 'custom',
                    notes: null,
                    linkedActivityId: s.activity!.activity_id,
                    createdAt: Date.now(),
                    sets: [],
                  })
                  setFormOpen(true)
                }}
              >
                Add sets for this session
              </Button>
            )}
          </Card>
        ))}
        {visibleSessions < sessions.length && (
          <Button variant="secondary" onClick={() => setVisibleSessions((n) => n + SESSIONS_PAGE_SIZE)} className="self-center">
            Load more
          </Button>
        )}
      </div>

      <Card>
        <p className="mb-2 font-semibold">Your logged data</p>
        <p className="mb-3 text-xs text-[var(--text-tertiary)]">
          Workouts you log here are stored only in this browser — they're a separate, manually-entered record, since
          Garmin's own data export doesn't include your actual sets, reps, or weight.
        </p>
        {confirmingClear ? (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="border-rose-500/40 text-rose-400"
              onClick={async () => {
                await clearAll()
                setConfirmingClear(false)
              }}
            >
              Yes, delete all logged workouts
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingClear(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmingClear(true)} disabled={workouts.length === 0}>
            Clear logged workouts
          </Button>
        )}
      </Card>
    </div>
  )
}

function StatTile({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-[var(--text-tertiary)]">{sublabel}</p>
    </Card>
  )
}
