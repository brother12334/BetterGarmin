import { useState } from 'react'
import { Ring } from '../../components/ui/Ring'
import { Button } from '../../components/ui/Button'
import { useGoals } from './useGoals'
import { useGoalsProgress } from './useGoalsProgress'
import { formatHoursMinutes } from '../../lib/duration'

function pct(value: number | null, goal: number): number | null {
  if (value == null || goal <= 0) return null
  return Math.min(100, (value / goal) * 100)
}

export function GoalsCard() {
  const { goals, setGoal } = useGoals()
  const progress = useGoalsProgress()
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Ring
          value={pct(progress.steps, goals.steps)}
          metric="energy"
          size={92}
          strokeWidth={8}
          label="Steps"
          sublabel={progress.steps != null ? progress.steps.toLocaleString() : undefined}
        />
        <Ring
          value={pct(progress.sleepMinutes, goals.sleepMinutes)}
          metric="sleep"
          size={92}
          strokeWidth={8}
          label="Sleep"
          sublabel={progress.sleepMinutes != null ? formatHoursMinutes(progress.sleepMinutes) : undefined}
        />
        <Ring
          value={pct(progress.activeDays, goals.activeDays)}
          metric="training"
          size={92}
          strokeWidth={8}
          label="Active"
          sublabel={progress.activeDays != null ? `${progress.activeDays}/${goals.activeDays}` : undefined}
        />
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <GoalInput label="Daily step goal" value={goals.steps} step={500} onChange={(v) => setGoal('steps', v)} />
          <GoalInput
            label="Sleep goal (hours)"
            value={Math.round((goals.sleepMinutes / 60) * 10) / 10}
            step={0.5}
            onChange={(v) => setGoal('sleepMinutes', Math.round(v * 60))}
          />
          <GoalInput
            label="Active days per week"
            value={goals.activeDays}
            step={1}
            max={7}
            onChange={(v) => setGoal('activeDays', Math.min(7, v))}
          />
          <Button variant="ghost" onClick={() => setEditing(false)} className="self-start">
            Done
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setEditing(true)} className="self-start">
          Edit goals
        </Button>
      )}
    </div>
  )
}

function GoalInput({
  label,
  value,
  step,
  max,
  onChange,
}: {
  label: string
  value: number
  step: number
  max?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v) && v >= 0) onChange(v)
        }}
        className="w-24 rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1 text-right text-[var(--text-primary)]"
      />
    </label>
  )
}
