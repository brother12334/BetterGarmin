import { useState } from 'react'
import { METRIC_COLORS, type MetricKey } from '../../components/ui/metricColors'
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
      {/* Each goal as its metric's colour block: percent of goal large, the actual figure under it. */}
      <div className="grid grid-cols-3 gap-2">
        <GoalBlock metric="neutral" label="Steps" value={pct(progress.steps, goals.steps)} sub={progress.steps != null ? progress.steps.toLocaleString() : undefined} />
        <GoalBlock metric="sleep" label="Sleep" value={pct(progress.sleepMinutes, goals.sleepMinutes)} sub={progress.sleepMinutes != null ? formatHoursMinutes(progress.sleepMinutes) : undefined} />
        <GoalBlock metric="training" label="Active" value={pct(progress.activeDays, goals.activeDays)} sub={progress.activeDays != null ? `${progress.activeDays}/${goals.activeDays} days` : undefined} />
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
        className="w-24 rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1 text-right text-[var(--text-primary)]"
      />
    </label>
  )
}

function GoalBlock({ metric, label, value, sub }: { metric: MetricKey; label: string; value: number | null; sub?: string }) {
  const c = METRIC_COLORS[metric]
  return (
    <div className="metric-block flex flex-col p-3" style={{ ['--block' as string]: metric === 'neutral' ? 'var(--bg-panel)' : c.block, ['--block-ink' as string]: metric === 'neutral' ? 'var(--text-primary)' : c.blockInk }}>
      <span className="blk-label text-sm">{label}</span>
      <span className="blk-num mt-1 text-[2rem]">{value == null ? '—' : `${Math.round(value)}%`}</span>
      {sub && <span className="mt-1 text-xs font-semibold opacity-75">{sub}</span>}
    </div>
  )
}
