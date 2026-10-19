import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { MuscleGroup } from '../../lib/strength'
import { EXERCISE_CATALOG, SPLIT_NAMES, liveRng, planStrengthWorkout, type StrengthSplit } from '../../lib/strengthPlans'
import type { SetRecord, WorkoutRecord, WorkoutWithSets } from '../../db/strengthLog'

interface DraftSet {
  key: string
  exercise: string
  category: MuscleGroup
  reps: number
  weight: number | null
  isWarmup: boolean
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const SPLITS: StrengthSplit[] = ['push', 'pull', 'legs', 'full_body']

interface LogWorkoutFormProps {
  existing?: WorkoutWithSets
  onSave: (workout: WorkoutRecord, sets: SetRecord[]) => Promise<void>
  onCancel: () => void
}

export function LogWorkoutForm({ existing, onSave, onCancel }: LogWorkoutFormProps) {
  const [day, setDay] = useState(existing?.day ?? todayStr())
  const [split, setSplit] = useState<StrengthSplit | 'custom'>(existing?.split ?? 'push')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [sets, setSets] = useState<DraftSet[]>(
    existing?.sets.map((s) => ({ key: s.id, exercise: s.exercise, category: s.category, reps: s.reps, weight: s.weight, isWarmup: s.isWarmup })) ?? [],
  )
  const [saving, setSaving] = useState(false)

  function quickFill(template: StrengthSplit) {
    const planned = planStrengthWorkout(liveRng(), template, 1, 1)
    setSplit(template)
    setSets(planned.map((p) => ({ key: newKey(), exercise: p.exercise, category: p.category, reps: p.reps, weight: p.weightKg, isWarmup: p.isWarmup })))
  }

  function addSet(afterExercise?: string, category?: MuscleGroup) {
    setSets((prev) => [...prev, { key: newKey(), exercise: afterExercise ?? EXERCISE_CATALOG[0].name, category: category ?? EXERCISE_CATALOG[0].category, reps: 8, weight: null, isWarmup: false }])
  }

  function updateSet(key: string, patch: Partial<DraftSet>) {
    setSets((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function removeSet(key: string) {
    setSets((prev) => prev.filter((s) => s.key !== key))
  }

  async function handleSave() {
    if (sets.length === 0) return
    setSaving(true)
    const id = existing?.id ?? newKey()
    const createdAt = existing?.createdAt ?? Date.now()
    // Keep everything else already on the record (timing, band UUID, import fields); drop the view-only extras.
    const { sets: _sets, clockOffsetMs: _offset, ...existingRecord } = existing ?? ({} as Partial<WorkoutWithSets>)
    void _sets
    void _offset
    const workout: WorkoutRecord = {
      ...existingRecord,
      id,
      day,
      split,
      notes: notes.trim() || null,
      linkedActivityId: existing?.linkedActivityId ?? null,
      createdAt,
    }
    const setRecords: SetRecord[] = sets.map((s, i) => ({
      id: `${id}-${i}`,
      workoutId: id,
      day,
      exercise: s.exercise,
      category: s.category,
      reps: s.reps,
      weight: s.weight,
      isWarmup: s.isWarmup,
      order: i,
      createdAt,
    }))
    await onSave(workout, setRecords)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-tertiary)]">Date</span>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-2 text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-tertiary)]">Split</span>
          <select
            value={split}
            onChange={(e) => setSplit(e.target.value as StrengthSplit | 'custom')}
            className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-2 text-[var(--text-primary)]"
          >
            {SPLITS.map((s) => (
              <option key={s} value={s}>
                {SPLIT_NAMES[s]}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs text-[var(--text-tertiary)]">Quick-fill a template, then edit the numbers below</p>
        <div className="flex flex-wrap gap-2">
          {SPLITS.map((s) => (
            <Button key={s} variant="secondary" onClick={() => quickFill(s)} className="text-xs">
              {SPLIT_NAMES[s]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {sets.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">No sets yet. Quick-fill a template or add one below.</p>}
        {sets.map((s) => (
          <div key={s.key} className="flex flex-col gap-2 rounded-control bg-[var(--bg-panel)] p-3">
            <div className="flex items-center gap-2">
              <select
                value={s.exercise}
                onChange={(e) => {
                  const match = EXERCISE_CATALOG.find((ex) => ex.name === e.target.value)
                  updateSet(s.key, { exercise: e.target.value, category: match?.category ?? s.category })
                }}
                className="min-w-0 flex-1 rounded-control border border-[var(--border-panel)] bg-[var(--bg-elevated)] px-2 py-2 text-sm text-[var(--text-primary)]"
              >
                {EXERCISE_CATALOG.map((ex) => (
                  <option key={ex.name} value={ex.name}>
                    {ex.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeSet(s.key)}
                className="shrink-0 text-xs text-rose-400 hover:text-rose-300"
                aria-label="Remove set"
              >
                Remove
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                value={s.reps}
                min={1}
                onChange={(e) => updateSet(s.key, { reps: Math.max(1, Number(e.target.value)) })}
                className="w-16 rounded-control border border-[var(--border-panel)] bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text-primary)]"
                aria-label="Reps"
              />
              <span className="text-xs text-[var(--text-tertiary)]">reps</span>
              <input
                type="number"
                value={s.weight ?? ''}
                placeholder="BW"
                min={0}
                step={0.5}
                onChange={(e) => updateSet(s.key, { weight: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-20 rounded-control border border-[var(--border-panel)] bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text-primary)]"
                aria-label="Weight"
              />
              <span className="text-xs text-[var(--text-tertiary)]">kg</span>
              <label className="ml-auto flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                <input type="checkbox" checked={s.isWarmup} onChange={(e) => updateSet(s.key, { isWarmup: e.target.checked })} />
                warmup
              </label>
            </div>
          </div>
        ))}
        <Button variant="ghost" onClick={() => addSet()} className="self-start text-sm">
          + Add set
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-tertiary)]">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] p-2 text-sm text-[var(--text-primary)]"
        />
      </label>

      <div className="flex gap-2">
        <Button loading={saving} onClick={handleSave} disabled={saving || sets.length === 0}>
          {saving ? 'Saving…' : 'Save workout'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
