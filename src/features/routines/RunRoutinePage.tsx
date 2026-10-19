import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useUnits } from '../../app/units'
import { convertWeight, weightUnitLabel } from '../../lib/units'
import { saveWorkout, type SetRecord, type WorkoutRecord } from '../../db/strengthLog'
import { useStrengthLog } from '../training/useStrengthLog'
import { clearDraft, loadDraft, loadRoutines, newId, previousSets, saveDraft, type RunDraft } from './routines'

const field = 'w-full rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-2 text-base tabular-nums'
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Log a routine set by set. Entries start from the targets, show what you did last time, and are saved on this device
 * after every change, so a refresh or a closed tab never loses an unfinished workout.
 */
export function RunRoutinePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { units } = useUnits()
  const { workouts } = useStrengthLog()
  const routine = useMemo(() => loadRoutines().find((r) => r.id === id) ?? null, [id])
  const toDisplay = (kg: number | null) => (kg == null ? '' : String(Math.round(convertWeight(kg, units) * 10) / 10))
  const toKg = (v: string) => (v.trim() === '' ? null : units === 'imperial' ? Number(v) / 2.20462 : Number(v))

  // Read before the first save below, so a fresh start isn't mistaken for a restored draft.
  const [restored] = useState(() => !!(routine && loadDraft(routine.id)))
  const [draft, setDraft] = useState<RunDraft | null>(() => {
    if (!routine) return null
    const saved = loadDraft(routine.id)
    if (saved) return saved
    return {
      routineId: routine.id,
      startedAt: Date.now(),
      notes: '',
      entries: routine.exercises.flatMap((e) =>
        Array.from({ length: e.sets }, () => ({ exerciseId: e.id, name: e.name, category: e.category, reps: String(e.reps), weight: toDisplay(e.weight), done: false })),
      ),
    }
  })
  useEffect(() => {
    if (draft) saveDraft(draft)
  }, [draft])

  if (!routine || !draft)
    return (
      <Card>
        <p className="text-sm">This routine no longer exists.</p>
        <Link to="/training/routines" className="mt-2 inline-block text-sm text-[var(--accent)]">
          Back to routines
        </Link>
      </Card>
    )

  const set = (i: number, patch: Partial<RunDraft['entries'][number]>) => setDraft((d) => d && { ...d, entries: d.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const groups = routine.exercises.map((ex) => ({ ex, rows: draft.entries.map((e, i) => ({ e, i })).filter(({ e }) => e.exerciseId === ex.id), prev: previousSets(workouts, ex.name) }))

  const finish = async () => {
    const done = draft.entries.filter((e) => e.done && Number(e.reps) > 0)
    if (!done.length) return
    const wid = newId()
    const day = todayStr()
    const createdAt = Date.now()
    const workout: WorkoutRecord = {
      id: wid,
      day,
      split: 'custom',
      title: routine.name,
      notes: draft.notes.trim() || null,
      linkedActivityId: null,
      createdAt,
      source: 'manual',
      startedAtEpochMs: draft.startedAt,
      finishedAtEpochMs: createdAt,
    }
    const sets: SetRecord[] = done.map((e, i) => ({ id: `${wid}-${i}`, workoutId: wid, day, exercise: e.name, category: e.category, reps: Number(e.reps), weight: toKg(e.weight), isWarmup: false, order: i, createdAt }))
    await saveWorkout(workout, sets)
    clearDraft(routine.id)
    navigate(`/training/strength/workout/${wid}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/training/routines" className="text-sm text-[var(--accent)]">
        ‹ Routines
      </Link>
      <h1 className="text-2xl font-bold">{routine.name}</h1>
      {restored && <p className="rounded-control bg-[var(--ring-track)] p-3 text-sm">Picked up your unfinished workout from {new Date(draft.startedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</p>}

      {groups.map(({ ex, rows, prev }) => (
        <Card key={ex.id} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">{ex.name}</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {prev ? `Last time (${new Date(`${prev.day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})` : 'No previous session'}
            </p>
          </div>
          <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2.75rem] items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span>Set</span>
            <span>Last</span>
            <span>Reps</span>
            <span>{weightUnitLabel(units)}</span>
            <span className="sr-only">Done</span>
          </div>
          {rows.map(({ e, i }, k) => {
            const p = prev?.sets[k]
            return (
              <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr_2.75rem] items-center gap-2">
                <span className="text-sm tabular-nums text-[var(--text-secondary)]">{k + 1}</span>
                <span className="text-sm tabular-nums text-[var(--text-tertiary)]">{p ? `${p.reps} × ${p.weight != null ? toDisplay(p.weight) : 'BW'}` : '—'}</span>
                <input aria-label={`${ex.name} set ${k + 1} reps`} type="number" inputMode="numeric" value={e.reps} onChange={(ev) => set(i, { reps: ev.target.value })} className={field} />
                <input aria-label={`${ex.name} set ${k + 1} weight`} type="number" inputMode="decimal" step="0.5" value={e.weight} onChange={(ev) => set(i, { weight: ev.target.value })} placeholder="BW" className={field} />
                <button
                  type="button"
                  aria-label={`Set ${k + 1} done`}
                  aria-pressed={e.done}
                  onClick={() => set(i, { done: !e.done })}
                  className={`min-h-11 rounded-control text-lg ${e.done ? 'bg-emerald-500 text-black' : 'bg-[var(--ring-track)] text-[var(--text-tertiary)]'}`}
                >
                  ✓
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => setDraft((d) => d && { ...d, entries: [...d.entries, { exerciseId: ex.id, name: ex.name, category: ex.category, reps: String(ex.reps), weight: toDisplay(ex.weight), done: false }] })}
            className="self-start text-sm text-[var(--accent)]"
          >
            + Add set
          </button>
        </Card>
      ))}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Notes</span>
        <textarea rows={3} value={draft.notes} onChange={(e) => setDraft((d) => d && { ...d, notes: e.target.value })} className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2 text-base" />
      </label>
      <Button onClick={finish} disabled={!draft.entries.some((e) => e.done)}>
        Finish and save ({draft.entries.filter((e) => e.done).length} sets)
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          if (!confirm('Discard this unfinished workout?')) return
          clearDraft(routine.id)
          navigate('/training/routines')
        }}
      >
        Discard
      </Button>
    </div>
  )
}
