import type { DailySummaryRow, HrvRow, SleepRow } from '../../db/types'
import { hmsToMinutes, formatHoursMinutes } from '../../lib/duration'

export function buildTodayInsights(summary: DailySummaryRow | null, sleep: SleepRow | null, hrv: HrvRow | null): string[] {
  const insights: string[] = []

  if (sleep?.score != null) {
    const minutes = hmsToMinutes(sleep.total_sleep)
    insights.push(`You slept ${formatHoursMinutes(minutes)} last night — a ${sleep.qualifier ?? 'solid'} night with a sleep score of ${sleep.score}.`)
  }

  if (summary?.stress_avg != null) {
    const band = summary.stress_avg < 25 ? 'low' : summary.stress_avg < 50 ? 'medium' : 'high'
    insights.push(`Your average stress today is ${summary.stress_avg} — that's in the ${band} range.`)
  }

  if (hrv?.last_night_avg != null && hrv.baseline_low != null && hrv.baseline_upper != null) {
    if (hrv.last_night_avg < hrv.baseline_low) {
      insights.push(`Your HRV last night (${hrv.last_night_avg} ms) was below your usual ${hrv.baseline_low}–${hrv.baseline_upper} ms range — a sign of extra fatigue.`)
    } else if (hrv.last_night_avg > hrv.baseline_upper) {
      insights.push(`Your HRV last night (${hrv.last_night_avg} ms) was above your usual range — a good sign of recovery.`)
    } else {
      insights.push(`Your HRV last night (${hrv.last_night_avg} ms) was right in your typical ${hrv.baseline_low}–${hrv.baseline_upper} ms range.`)
    }
  }

  if (summary?.steps != null && summary.step_goal) {
    const pct = Math.round((summary.steps / summary.step_goal) * 100)
    insights.push(`You've taken ${summary.steps.toLocaleString()} steps — ${pct}% of your ${summary.step_goal.toLocaleString()} step goal.`)
  }

  return insights.slice(0, 3)
}
