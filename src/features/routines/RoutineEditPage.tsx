import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useUnits } from '../../app/units'
import { convertWeight, weightUnitLabel } from '../../lib/units'
import { EXERCISE_CATALOG } from '../../lib/strengthPlans'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '../../lib/strength'
import { loadRoutines, newId, upsertRoutine, type Routine, type RoutineExercise } from './routines'

const field = 'rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2 text-base'

/** Create or edit a routine: name, exercises in order, target sets, reps and weight. */
export function RoutineEditPage() {
  const { id = 'new' } = useParams()
  const navigate = useNavigate()
  const { units } = useUnits()
  const existing = id === 'new' ? null : (loadRoutines().find((r) => r.id === id) ?? null)
  const [name, setName] = useState(existing?.name ?? '')
  const [exercises, setExercises] = useState<RoutineExercise[]>(existing?.exercises ?? [])
  const toKg = (v: string) => (v.trim() === '' ? null : units === 'imperial' ? Number(v) / 2.20462 : Number(v))
  const fromKg = (kg: number | null) => (kg == null ? '' : String(Math.round(convertWeight(kg, units) * 10) / 10))

  const update = (eid: string, patch: Partial<RoutineExercise>) => setExercises((l) => l.map((e) => (e.id === eid ? { ...e, ...patch } : e)))
  const move = (i: number, d: -1 | 1) =>
    setExercises((l) => {
      const j = i + d
      if (j < 0 || j >= l.length) return l
      const c = [...l]
      ;[c[i], c[j]] = [c[j], c[i]]
      return c
    })

  const save = () => {
    const r: Routine = { id: existing?.id ?? newId(), name: name.trim() || 'Untitled routine', pinned: existing?.pinned ?? false, exercises, updatedAt: Date.now() }
    upsertRoutine(r)
    navigate('/training/routines')
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/training/routines" className="text-sm text-[var(--accent)]">
        ‹ Routines
      </Link>
      <h1 className="text-2xl font-bold">{existing ? 'Edit routine' : 'New routine'}</h1>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Upper A" className={field} />
      </label>

      <datalist id="exercise-catalog">
        {EXERCISE_CATALOG.map((e) => (
          <option key={e.name} value={e.name} />
        ))}
      </datalist>

      {exercises.map((e, i) => (
        <Card key={e.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              list="exercise-catalog"
              value={e.name}
              aria-label={`Exercise ${i + 1}`}
              onChange={(ev) => {
                const known = EXERCISE_CATALOG.find((c) => c.name === ev.target.value)
                update(e.id, { name: ev.target.value, ...(known ? { category: known.category } : {}) })
              }}
              className={`${field} min-w-0 flex-1`}
            />
            <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="min-h-11 min-w-11 rounded-control disabled:opacity-30">
              ↑
            </button>
            <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === exercises.length - 1} className="min-h-11 min-w-11 rounded-control disabled:opacity-30">
              ↓
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--text-tertiary)]">
              Sets
              <input type="number" inputMode="numeric" min={1} value={e.sets} onChange={(ev) => update(e.id, { sets: Math.max(1, Number(ev.target.value) || 1) })} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-tertiary)]">
              Reps
              <input type="number" inputMode="numeric" min={1} value={e.reps} onChange={(ev) => update(e.id, { reps: Math.max(1, Number(ev.target.value) || 1) })} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-tertiary)]">
              Weight ({weightUnitLabel(units)})
              <input type="number" inputMode="decimal" min={0} step="0.5" value={fromKg(e.weight)} onChange={(ev) => update(e.id, { weight: toKg(ev.target.value) })} placeholder="—" className={field} />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            <select value={e.category} onChange={(ev) => update(e.id, { category: ev.target.value as MuscleGroup })} aria-label="Muscle group" className={field}>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {MUSCLE_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={() => setExercises((l) => l.filter((x) => x.id !== e.id))}>
              Remove
            </Button>
          </div>
        </Card>
      ))}

      <Button
        variant="secondary"
        onClick={() => setExercises((l) => [...l, { id: newId(), name: EXERCISE_CATALOG[0].name, category: EXERCISE_CATALOG[0].category, sets: 3, reps: 8, weight: null }])}
      >
        Add exercise
      </Button>
      <Button onClick={save} disabled={exercises.length === 0}>
        Save routine
      </Button>
    </div>
  )
}
