import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { InfoButton } from '../../components/ui/InfoButton'
import { Skeleton } from '../../components/ui/Skeleton'
import { SyncFirstCard } from './SyncFirstCard'
import { useUnits } from '../../app/units'
import { convertWeight, formatWeight, weightUnitLabel } from '../../lib/units'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '../../lib/strength'
import { EXERCISE_CATALOG, SPLIT_NAMES } from '../../lib/strengthPlans'
import {
  getAllWorkoutsWithSets,
  getImportRecord,
  getWorkoutForReview,
  resetWorkoutEdits,
  saveSetFields,
  saveWeightScale,
  type CorrectionRecord,
  type ImportRecord,
  type SetRecord,
  type WorkoutRecord,
} from '../../db/strengthLog'
import { applyCorrections, findLikelyDuplicates, workoutSettings, type EffectiveSet, type SetFieldEdits } from '../../db/applyCorrections'
import { parseElement26Export } from './element26Import'
import { formatTime } from '../../lib/clock'

const LB_TO_KG = 0.45359237

/** Closest known exercise name by shared words (e.g. "Bench Press" → "Barbell Bench Press"), or null. */
function closestExercise(name: string, known: Iterable<string>): string | null {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1))
  const target = words(name)
  let best: { name: string; score: number } | null = null
  for (const k of known) {
    const kw = words(k)
    const shared = [...target].filter((w) => kw.has(w)).length
    const score = shared / Math.max(target.size, kw.size)
    if (shared >= 1 && score >= 0.5 && (!best || score > best.score)) best = { name: k, score }
  }
  return best?.name ?? null
}

interface ReviewData {
  workout: WorkoutRecord
  original: SetRecord[]
  corrections: CorrectionRecord[]
  importRecord: ImportRecord | null
  knownExercises: Set<string>
}

export function ImportReviewPage() {
  const { workoutId } = useParams<{ workoutId: string }>()
  const { units } = useUnits()
  const [data, setData] = useState<ReviewData | null | 'missing'>(null)
  const [showRaw, setShowRaw] = useState(false)

  const [version, setVersion] = useState(0)
  const load = useCallback(async () => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!workoutId) return
    let cancelled = false
    Promise.all([getWorkoutForReview(workoutId), getImportRecord(workoutId), getAllWorkoutsWithSets()]).then(([r, importRecord, all]) => {
      if (cancelled) return
      if (!r) return setData('missing')
      const knownExercises = new Set([...EXERCISE_CATALOG.map((e) => e.name), ...all.filter((w) => w.id !== workoutId).flatMap((w) => w.sets.map((s) => s.exercise))])
      setData({ workout: r.workout, original: r.sets, corrections: r.corrections, importRecord, knownExercises })
    })
    return () => {
      cancelled = true
    }
  }, [workoutId, version])

  const derived = useMemo(() => {
    if (!data || data === 'missing') return null
    const applied = applyCorrections(data.workout, data.original, data.corrections)
    const effectiveById = new Map<string, EffectiveSet & { excluded?: boolean }>([
      ...applied.sets.map((s) => [s.id, s] as const),
      ...applied.excluded.map((s) => [s.id, { ...s, excluded: true }] as const),
    ])
    const fieldsById = new Map(data.corrections.filter((c) => c.setId).map((c) => [c.setId as string, c.fields ?? {}]))
    const duplicates = findLikelyDuplicates(data.original)
    const parsedWarnings = data.importRecord ? (() => {
      const r = parseElement26Export(data.importRecord.raw)
      return 'error' in r ? [r.error] : r.warnings
    })() : []
    const exercises = [...new Set(data.original.map((s) => s.exercise))]
    return { applied, effectiveById, fieldsById, duplicates, parsedWarnings, exercises, settings: workoutSettings(data.corrections, data.workout.id) }
  }, [data])

  if (data == null) return <Skeleton className="h-64 w-full" />
  if (data === 'missing' || !derived) return <Card className="text-center text-[var(--text-secondary)]">Workout not found.</Card>

  const { workout, original, importRecord, knownExercises } = data
  const { effectiveById, fieldsById, duplicates, parsedWarnings, exercises, settings } = derived
  const editCount = data.corrections.filter((c) => c.fields).length + (settings.weightScale !== 1 ? 1 : 0)
  const setFields = async (setId: string, f: SetFieldEdits | null) => {
    await saveSetFields(workout.id, setId, f)
    await load()
  }
  const sourceUnits = (importRecord?.raw as { units?: string } | undefined)?.units ?? 'kg'
  const unrecognized = exercises.filter((ex) => !knownExercises.has(fieldsById.get(original.find((s) => s.exercise === ex)!.id)?.exercise ?? ex))

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/training/strength/workout/${workout.id}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        ← Back to workout
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Review import</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {workout.title || (workout.split !== 'custom' ? SPLIT_NAMES[workout.split] : 'Workout')} · {new Date(`${workout.day}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })}
        </p>
        {importRecord && (
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            From {importRecord.fileName ?? 'Element 26 export'} · imported {new Date(importRecord.importedAt).toLocaleString()} · file units: {sourceUnits}
          </p>
        )}
      </div>

      <SyncFirstCard />

      <Card>
        <div className="mb-2 flex items-center gap-2">
          <p className="font-semibold">Things to check</p>
          <InfoButton title="Review">
            Every change here is stored as a correction on top of the import. The original file is kept untouched — "Reset all edits" or
            re-importing brings back exactly what was imported. Corrected values are used everywhere: timelines, progress, findings and the
            assistant.
          </InfoButton>
        </div>
        <ul className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
          {parsedWarnings.map((w) => (
            <li key={w} className="text-amber-400">
              • {w}
            </li>
          ))}
          {duplicates.size > 0 && (
            <li className="text-amber-400">
              • {duplicates.size} set(s) look like duplicates (same exercise, load and reps logged within 10 s).{' '}
              <button
                type="button"
                className="text-sky-400 underline"
                onClick={async () => {
                  for (const id of duplicates) await saveSetFields(workout.id, id, { excluded: true })
                  await load()
                }}
              >
                Exclude them
              </button>
            </li>
          )}
          {unrecognized.length > 0 && <li className="text-amber-400">• Not recognized as a known exercise: {unrecognized.join(', ')} — check the name and muscle group below.</li>}
          {parsedWarnings.length === 0 && duplicates.size === 0 && unrecognized.length === 0 && <li>Nothing looks wrong. You can still edit anything below.</li>}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-panel)] pt-3 text-xs">
          <span className="text-[var(--text-tertiary)]">
            Units fix{settings.weightScale !== 1 ? ` (active: ×${settings.weightScale.toFixed(4)})` : ''}:
          </span>
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={async () => { await saveWeightScale(workout.id, LB_TO_KG); await load() }}>
            Weights were really lb
          </Button>
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={async () => { await saveWeightScale(workout.id, 1 / LB_TO_KG); await load() }}>
            Weights were really kg
          </Button>
          {settings.weightScale !== 1 && (
            <button type="button" className="text-rose-400" onClick={async () => { await saveWeightScale(workout.id, 1); await load() }}>
              Undo units fix
            </button>
          )}
        </div>
      </Card>

      <Card>
        <p className="mb-2 font-semibold">Exercises</p>
        <div className="flex flex-col gap-3">
          {exercises.map((ex) => {
            const sets = original.filter((s) => s.exercise === ex)
            const f = fieldsById.get(sets[0].id) ?? {}
            return (
              <ExerciseRow
                key={ex}
                original={ex}
                originalCategory={sets[0].category}
                current={f.exercise ?? ex}
                currentCategory={f.category ?? sets[0].category}
                known={knownExercises.has(f.exercise ?? ex)}
                suggestion={knownExercises.has(f.exercise ?? ex) ? null : closestExercise(f.exercise ?? ex, knownExercises)}
                suggestions={[...knownExercises]}
                onApply={async (name, category) => {
                  for (const s of sets) {
                    await saveSetFields(workout.id, s.id, {
                      exercise: name === ex ? undefined : name,
                      category: category === s.category ? undefined : category,
                    })
                  }
                  await load()
                }}
              />
            )
          })}
        </div>
      </Card>

      <Card>
        <p className="mb-2 font-semibold">Sets</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="text-[var(--text-tertiary)]">
                <th className="py-1 pr-2 font-medium">Exercise</th>
                <th className="py-1 pr-2 font-medium">Load ({weightUnitLabel(units)})</th>
                <th className="py-1 pr-2 font-medium">Reps</th>
                <th className="py-1 pr-2 font-medium">Warm-up</th>
                <th className="py-1 pr-2 font-medium">Exclude</th>
              </tr>
            </thead>
            <tbody>
              {original.map((s) => {
                const e = effectiveById.get(s.id)!
                const f = fieldsById.get(s.id) ?? {}
                return (
                  <tr key={s.id} className={`border-t border-[var(--border-panel)] ${e.excluded ? 'opacity-40' : ''} ${duplicates.has(s.id) ? 'bg-amber-500/5' : ''}`}>
                    <td className="py-2 pr-2">
                      {e.exercise}
                      {s.atEpochMs != null && <span className="block text-xs text-[var(--text-tertiary)]">{formatTime(s.atEpochMs, { seconds: true })}</span>}
                    </td>
                    <td className="py-2 pr-2">
                      <NumberCell
                        key={`w-${e.weight}`}
                        value={e.weight != null ? Math.round(convertWeight(e.weight, units) * 10) / 10 : null}
                        edited={f.weight !== undefined}
                        was={f.weight !== undefined ? formatWeight(s.weight, units, 1) : undefined}
                        onCommit={(v) => {
                          const kg = v == null ? undefined : units === 'imperial' ? Math.round(v * LB_TO_KG * 100) / 100 : v
                          setFields(s.id, { weight: kg === s.weight ? undefined : kg })
                        }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <NumberCell key={`r-${e.reps}`} value={e.reps} integer edited={f.reps !== undefined} was={f.reps !== undefined ? `${s.reps}` : undefined} onCommit={(v) => setFields(s.id, { reps: v == null || v === s.reps ? undefined : v })} />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={e.isWarmup} onChange={(ev) => setFields(s.id, { isWarmup: ev.target.checked === s.isWarmup ? undefined : ev.target.checked })} aria-label="Warm-up" />
                      {f.isWarmup !== undefined && <span className="ml-1 text-xs text-sky-400">edited</span>}
                    </td>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={!!e.excluded} onChange={(ev) => setFields(s.id, { excluded: ev.target.checked ? true : undefined })} aria-label="Exclude set" />
                      {duplicates.has(s.id) && <span className="ml-1 text-amber-400">dup?</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[var(--text-tertiary)]">{editCount === 0 ? 'No edits — showing the import as-is.' : `${editCount} edit(s) applied on top of the import.`}</span>
          {editCount > 0 && (
            <button type="button" className="text-rose-400 hover:text-rose-300" onClick={async () => { await resetWorkoutEdits(workout.id); await load() }}>
              Reset all edits
            </button>
          )}
          {importRecord && (
            <button type="button" className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? 'Hide' : 'Show'} original file
            </button>
          )}
        </div>
        {showRaw && importRecord && <pre className="mt-2 max-h-80 overflow-auto rounded-control bg-[var(--bg-panel)] p-3 text-xs">{JSON.stringify(importRecord.raw, null, 2)}</pre>}
      </Card>
    </div>
  )
}

function ExerciseRow({
  original,
  originalCategory,
  current,
  currentCategory,
  known,
  suggestion,
  suggestions,
  onApply,
}: {
  original: string
  originalCategory: MuscleGroup
  current: string
  currentCategory: MuscleGroup
  known: boolean
  suggestion: string | null
  suggestions: string[]
  onApply: (name: string, category: MuscleGroup) => Promise<void>
}) {
  const [name, setName] = useState(current)
  const [category, setCategory] = useState<MuscleGroup>(currentCategory)
  const listId = `ex-${original.replace(/\W/g, '')}`
  const dirty = name.trim() !== current || category !== currentCategory
  return (
    <div className="flex flex-col gap-2 rounded-control border border-[var(--border-panel)] p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-[var(--text-tertiary)]">
          Imported as <b className="text-[var(--text-secondary)]">{original}</b> ({MUSCLE_GROUP_LABELS[originalCategory]})
        </p>
        {!known && <span className="rounded-full bg-amber-500/15 px-2 text-xs text-amber-400">unrecognized</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          list={listId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1"
          aria-label={`Exercise name for ${original}`}
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <select value={category} onChange={(e) => setCategory(e.target.value as MuscleGroup)} className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1" aria-label="Muscle group">
          {MUSCLE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {MUSCLE_GROUP_LABELS[g]}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          className="px-3 py-1 text-xs"
          disabled={!dirty || !name.trim()}
          onClick={() => {
            const known = EXERCISE_CATALOG.find((e) => e.name.toLowerCase() === name.trim().toLowerCase())
            onApply(known?.name ?? name.trim(), known && category === currentCategory ? known.category : category)
          }}
        >
          Apply
        </Button>
      </div>
      {suggestion && (
        <button type="button" className="self-start text-xs text-sky-400 hover:text-sky-300" onClick={() => setName(suggestion)}>
          Did you mean “{suggestion}”? (matching names keeps its history together)
        </button>
      )}
      {(current !== original || currentCategory !== originalCategory) && <p className="text-xs text-sky-400">Shown as {current} ({MUSCLE_GROUP_LABELS[currentCategory]})</p>}
    </div>
  )
}

function NumberCell({
  value,
  edited,
  was,
  integer,
  onCommit,
}: {
  value: number | null
  edited: boolean
  was?: string
  integer?: boolean
  onCommit: (v: number | null) => void
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const commit = () => {
    if (draft === (value == null ? '' : String(value))) return
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) return setDraft(value == null ? '' : String(value))
    onCommit(n)
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={`w-16 rounded-control border bg-[var(--bg-panel)] px-2 py-1 tabular-nums ${edited ? 'border-sky-400/60' : 'border-[var(--border-panel)]'}`}
      />
      {edited && was && (
        <button type="button" title={`Imported: ${was}. Click to restore.`} className="text-xs text-sky-400" onClick={() => onCommit(null)}>
          was {was}
        </button>
      )}
    </span>
  )
}
