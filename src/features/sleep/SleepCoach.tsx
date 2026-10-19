import { Card } from '../../components/ui/Card'
import { InfoButton } from '../../components/ui/InfoButton'
import type { SleepRow } from '../../db/types'
import { formatClockHours } from '../../lib/clock'
import { formatHoursMinutes, hmsToMinutes } from '../../lib/duration'

const BASELINE_MIN = 480
const mins = (v: string | null) => hmsToMinutes(v) ?? 0
/** "20m" under an hour, otherwise "1h 05m". */
const short = (m: number) => (Math.abs(m) < 60 ? `${Math.round(Math.abs(m))}m` : formatHoursMinutes(Math.abs(m)))
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export interface SleepCoachPlan {
  needMin: number
  changeMin: number
  history: 'Good' | 'Fair' | 'Poor'
  historyNote: string
  reasons: string[]
  /** Fractional clock hours for the suggested bedtime window, or null without a usual wake time. */
  window: [number, number] | null
}

/** Tonight's sleep need: 8 hours, plus part of the recent shortfall, nudged by how well you've been sleeping. */
export function planSleep(nights: SleepRow[], usualWake: number | null): SleepCoachPlan {
  const last3 = nights.slice(-3).map((n) => mins(n.total_sleep))
  const scores = nights
    .slice(-7)
    .map((n) => n.score)
    .filter((s): s is number => s != null)
  const shortfall = avg(last3.map((m) => BASELINE_MIN - m)) ?? 0
  const scoreAvg = avg(scores)

  const reasons: string[] = []
  let change = Math.max(-30, Math.min(60, shortfall * 0.5))
  if (shortfall > 20) reasons.push(`You've averaged ${formatHoursMinutes(BASELINE_MIN - shortfall)} over the last ${last3.length} nights, so you have some sleep to catch up on.`)
  else if (shortfall < -20) reasons.push("You've slept more than usual lately, so you're well rested.")
  if (scoreAvg != null && scoreAvg < 60) {
    change += 15
    reasons.push('Your sleep quality has been low, so a little extra time in bed will help.')
  } else if (scoreAvg != null && scoreAvg >= 80) {
    change -= 10
    reasons.push('Your recent sleep has been high quality.')
  }
  change = Math.round(change / 5) * 5
  const needMin = BASELINE_MIN + change

  const history = scoreAvg == null ? 'Fair' : scoreAvg >= 80 ? 'Good' : scoreAvg >= 60 ? 'Fair' : 'Poor'
  const historyNote = history === 'Good' ? 'High-quality sleep recently' : history === 'Fair' ? 'Average sleep recently' : 'Low-quality sleep recently'
  // Rounded to 5 minutes so the window reads like a plan, not a measurement.
  const bed = usualWake == null ? null : Math.round((usualWake - needMin / 60) * 12) / 12
  return { needMin, changeMin: change, history, historyNote, reasons, window: bed == null ? null : [bed - 1 / 6, bed + 1 / 6] }
}

export function SleepCoach({ nights, usualWake }: { nights: SleepRow[]; usualWake: number | null }) {
  const plan = planSleep(nights, usualWake)
  const { needMin, changeMin } = plan
  // The bar starts at 6 hours so small changes are still easy to see.
  const scaleMin = 360
  const scaleMax = Math.max(needMin, BASELINE_MIN) + 30
  const pct = (m: number) => `${((m - scaleMin) / (scaleMax - scaleMin)) * 100}%`
  const headline = changeMin > 0 ? 'You need more sleep tonight.' : changeMin < 0 ? 'You need less sleep tonight.' : 'Your usual amount will do tonight.'
  const changeText = changeMin === 0 ? 'the same as' : `about ${short(changeMin)} ${changeMin > 0 ? 'more' : 'less'} sleep compared to`

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <p className="font-semibold">Sleep coach</p>
        <InfoButton title="Sleep coach">
          BetterGarmin's estimate: 8 hours, plus half of your shortfall over the last 3 nights, adjusted for your recent sleep scores. The bedtime window
          counts back from your usual wake time.
        </InfoButton>
      </div>

      <div className="mt-2 text-center">
        <p className="text-5xl font-extrabold tabular-nums">{formatHoursMinutes(needMin)}</p>
        <p className="text-sm text-[var(--text-secondary)]">Recommended</p>
      </div>

      <div className="relative mx-auto mt-8 h-24 w-[85%]">
        <div
          className="absolute left-0 top-6 h-5 border-l-2 border-[var(--text-primary)]"
          style={{
            width: pct(needMin),
            backgroundImage: 'repeating-linear-gradient(-45deg, #60a5fa 0 2px, transparent 2px 6px)',
          }}
        />
        <Tick at={pct(needMin)} label={formatHoursMinutes(needMin)} bold />
        {changeMin !== 0 && <Tick at={pct(BASELINE_MIN)} label="8h" side={changeMin > 0 ? 'left' : 'right'} />}
        {changeMin !== 0 && (
          <div className="absolute top-[68px] -translate-x-1/2 text-center" style={{ left: pct((needMin + BASELINE_MIN) / 2) }}>
            <span className="mx-auto block h-2.5 w-6 rounded-full border-2 border-orange-500" />
            <span className="whitespace-nowrap text-xs text-[var(--text-secondary)]">
              {changeMin > 0 ? '+' : '−'}
              {short(changeMin)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <p className="text-lg font-bold">{headline}</p>
        <p className="text-sm text-[var(--text-secondary)]">You need {changeText} your 8-hour baseline.</p>
        {plan.reasons.map((r) => (
          <p key={r} className="text-sm text-[var(--text-secondary)]">
            {r}
          </p>
        ))}
        {plan.window && (
          <p className="text-sm">
            To get it tonight, aim to fall asleep between{' '}
            <span className="font-semibold">
              {formatClockHours(plan.window[0])} – {formatClockHours(plan.window[1])}
            </span>
            .
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-control bg-[var(--bg-elevated)] px-4 py-3">
        <div>
          <p className="font-semibold">Sleep history</p>
          <p className="text-xs text-[var(--text-tertiary)]">{plan.historyNote}</p>
        </div>
        <p className="text-lg font-semibold">{plan.history}</p>
      </div>
    </Card>
  )
}

/** A vertical tick on the bar. Side ticks put their label beside the line so it can't collide with the main one. */
function Tick({ at, label, bold, side }: { at: string; label: string; bold?: boolean; side?: 'left' | 'right' }) {
  if (side) {
    return (
      <div className="absolute top-6" style={{ left: at }}>
        <span className="block h-5 w-0.5 -translate-x-1/2 bg-[var(--text-primary)]" />
        <span className={`absolute top-6 whitespace-nowrap text-xs text-[var(--text-secondary)] ${side === 'right' ? 'left-1.5' : 'right-1.5'}`}>{label}</span>
      </div>
    )
  }
  return (
    <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: at }}>
      <span className={bold ? 'whitespace-nowrap text-sm font-bold' : 'text-xs text-[var(--text-secondary)]'}>{label}</span>
      <span className="mx-auto mt-1 block h-6 w-0.5 bg-[var(--text-primary)]" />
    </div>
  )
}
