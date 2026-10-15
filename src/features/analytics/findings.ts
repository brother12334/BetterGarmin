import { addDays } from '../../lib/dateRange'
import { estimateOneRepMax } from '../../lib/strength'
import type { AnalyticsDataset, ExerciseSession, SessionRecord } from './model'
import type { RecoverySummary } from './recovery'
import { cliffsDelta, correlationEvidence, evidenceFor, magnitudeOf, median, MIN_GROUP_N, spearman, splitAtMedian, type Evidence } from './robust'

export type FindingKind =
  | 'progression'
  | 'sleep-performance'
  | 'time-of-day'
  | 'rest-reps'
  | 'volume-rhr'
  | 'recovery-cluster'
  | 'routine-change'
  | 'hr-response'

export interface FindingLink {
  label: string
  to: string
}

export interface Finding {
  /** Stable per subject (e.g. "progression:Bench Press"), so new data updates a finding instead of creating another. */
  id: string
  kind: FindingKind
  title: string
  summary: string
  startDay: string
  endDay: string
  n: number
  nLabel: string
  evidence: Evidence
  /** Signed effect in [-1, 1] (Cliff's delta or Spearman rho); null for descriptive findings. */
  effect: number | null
  effectLabel: string | null
  metrics: { label: string; value: string }[]
  method: string
  alternatives: string[]
  links: FindingLink[]
  /** What would be needed before this can say anything (only for insufficient findings). */
  needs?: string
  score: number
}

export interface FindingOptions {
  /** Only use data on/after this day (prospective experiments). */
  from?: string
}

const EVIDENCE_WEIGHT: Record<Evidence, number> = { insufficient: 0, weak: 1, moderate: 2, strong: 3 }
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10)}%`
const workoutLink = (s: { workoutId: string; day: string }, timed: boolean): FindingLink => ({
  label: new Date(`${s.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  to: timed ? `/training/strength/workout/${s.workoutId}` : '/training/strength',
})

function score(evidence: Evidence, effect: number | null, bonus = 0): number {
  return EVIDENCE_WEIGHT[evidence] * (0.5 + Math.abs(effect ?? 0)) + bonus
}

function sessionsFrom(ds: AnalyticsDataset, opts: FindingOptions): SessionRecord[] {
  return opts.from ? ds.sessions.filter((s) => s.day >= opts.from!) : ds.sessions
}

/**
 * Relative performance of one exercise session: its top e1RM divided by the median top e1RM of the previous
 * (up to 8) sessions of the same exercise. Compares each exercise only with itself, so a squat day and a curl day
 * are never treated as equivalent. Null until 3 earlier sessions exist.
 */
export function relativePerformance(history: ExerciseSession[]): Map<string, number> {
  const out = new Map<string, number>()
  const withLoad = history.filter((h) => h.topE1rm != null)
  withLoad.forEach((h, i) => {
    const prior = withLoad.slice(Math.max(0, i - 8), i).map((p) => p.topE1rm as number)
    if (prior.length < 3) return
    const m = median(prior)
    if (m && m > 0) out.set(h.workoutId, (h.topE1rm as number) / m)
  })
  return out
}

/** Session performance index = median relative performance across the session's exercises. */
export function sessionPerformance(ds: AnalyticsDataset): Map<string, number> {
  const perExercise = new Map<string, Map<string, number>>()
  for (const [ex, hist] of ds.exerciseHistory) perExercise.set(ex, relativePerformance(hist))
  const out = new Map<string, number>()
  for (const s of ds.sessions) {
    const vals = s.exercises.map((e) => perExercise.get(e.exercise)?.get(s.workoutId)).filter((v): v is number => v != null)
    const m = median(vals)
    if (m != null) out.set(s.workoutId, m)
  }
  return out
}

// --- Generators --------------------------------------------------------------------------------------------------

export function progressionFindings(ds: AnalyticsDataset, recovery: RecoverySummary | null, opts: FindingOptions = {}): Finding[] {
  const out: Finding[] = []
  for (const [exercise, all] of ds.exerciseHistory) {
    const hist = (opts.from ? all.filter((h) => h.day >= opts.from!) : all).filter((h) => h.topE1rm != null)
    const id = `progression:${exercise}`
    if (hist.length < 6) {
      if (hist.length >= 2)
        out.push(insufficient(id, 'progression', `${exercise}: progression`, hist[0]?.day ?? ds.firstDay, ds.lastDay, hist.length, 'sessions', `${6 - hist.length} more session(s) of ${exercise}`, 0.1))
      continue
    }
    const recent = hist.slice(-3)
    const earlier = hist.slice(0, -3).slice(-9)
    const e1 = (h: ExerciseSession) => h.workingSets.filter((s) => s.weight != null && s.weight > 0).map((s) => estimateOneRepMax(s.weight as number, s.reps))
    const delta = cliffsDelta(recent.flatMap(e1), earlier.flatMap(e1))
    const mRecent = median(recent.map((h) => h.topE1rm as number))!
    const mEarlier = median(earlier.map((h) => h.topE1rm as number))!
    const change = (mRecent - mEarlier) / mEarlier
    const evidence = evidenceFor(Math.min(recent.length * 2, earlier.length), delta)
    const mag = delta != null ? magnitudeOf(delta) : 'negligible'
    const direction = mag === 'negligible' ? 'stable' : delta! > 0 ? 'up' : 'down'

    // Comparable load: the most-used weight in both periods — reps achieved there, early vs recent.
    const repsAt = (sessions: ExerciseSession[]) => {
      const m = new Map<number, number>()
      for (const h of sessions) for (const s of h.workingSets) if (s.weight != null) m.set(Math.round(s.weight * 2) / 2, Math.max(m.get(Math.round(s.weight * 2) / 2) ?? 0, s.reps))
      return m
    }
    const er = repsAt(earlier)
    const rr = repsAt(recent)
    const shared = [...er.keys()].filter((w) => rr.has(w)).sort((a, b) => b - a)[0]

    const calm = recovery && recovery.available > 0 && recovery.differingLessRecovered === 0
    out.push({
      id,
      kind: 'progression',
      title:
        direction === 'stable'
          ? `${exercise}: performance has held steady`
          : `${exercise}: estimated 1RM ${direction} ${pct(change).replace(/^[+−]/, '')} in recent sessions`,
      summary: `Median top-set e1RM ${mRecent.toFixed(1)} kg over the last 3 sessions vs. ${mEarlier.toFixed(1)} kg over the ${earlier.length} before.${
        shared != null ? ` At ${shared} kg: best ${er.get(shared)} reps earlier, ${rr.get(shared)} recently.` : ''
      }${direction === 'up' && calm ? ' Your tracked recovery indicators stayed within their usual range over this time — the watch data shows no corresponding change.' : ''}`,
      startDay: earlier[0].day,
      endDay: recent[recent.length - 1].day,
      n: recent.length + earlier.length,
      nLabel: 'sessions',
      evidence,
      effect: delta,
      effectLabel: delta != null ? `Cliff's δ ${delta.toFixed(2)} (${mag})` : null,
      metrics: [
        { label: 'Recent median e1RM', value: `${mRecent.toFixed(1)} kg` },
        { label: 'Earlier median e1RM', value: `${mEarlier.toFixed(1)} kg` },
        { label: 'Change', value: pct(change) },
      ],
      method: 'Epley e1RM of working sets. Last 3 sessions compared with up to 9 before them using Cliff’s delta on set-level e1RM. e1RM is an estimate from reps × load, not a tested max.',
      alternatives: ['Changes in exercise variation, equipment, range of motion or rep targets', 'A planned deload or a new training block', 'Logging differences (e.g. counting partial reps)'],
      links: recent.map((h) => workoutLink(h, ds.aligned.has(h.workoutId))),
      score: score(evidence, delta, direction === 'stable' ? -0.5 : 0),
    })
  }
  return out
}

export function sleepPerformanceFinding(ds: AnalyticsDataset, opts: FindingOptions = {}): Finding {
  const perf = sessionPerformance(ds)
  const rows = sessionsFrom(ds, opts)
    .map((s) => ({ s, p: perf.get(s.workoutId), sleep: ds.dayIndex.get(s.day)?.sleepMinutes ?? null }))
    .filter((r): r is { s: SessionRecord; p: number; sleep: number } => r.p != null && r.sleep != null)
  const id = 'sleep-performance'
  if (rows.length < 10) return insufficient(id, 'sleep-performance', 'Sleep before a session vs. performance', rows[0]?.s.day ?? ds.firstDay, ds.lastDay, rows.length, 'sessions with sleep data', `${10 - rows.length} more session(s) with both sleep data and comparable earlier sessions`, 0.4)
  const split = splitAtMedian(rows, (r) => r.sleep)!
  const { cut, high: longer, low: shorter } = split
  if (Math.min(longer.length, shorter.length) < MIN_GROUP_N)
    return insufficient(id, 'sleep-performance', 'Sleep before a session vs. performance', rows[0].s.day, ds.lastDay, rows.length, 'sessions with sleep data', 'more variety in sleep duration before sessions (at least 5 each above and below your median)', 0.4)
  const delta = cliffsDelta(longer.map((r) => r.p), shorter.map((r) => r.p))
  const evidence = evidenceFor(Math.min(longer.length, shorter.length), delta)
  const diff = median(longer.map((r) => r.p))! - median(shorter.map((r) => r.p))!
  const mag = delta != null ? magnitudeOf(delta) : 'negligible'
  return {
    id,
    kind: 'sleep-performance',
    title:
      mag === 'negligible'
        ? 'Sleep the night before shows little relationship with your performance'
        : `After longer sleep, your sessions tended to be ${delta! > 0 ? 'stronger' : 'weaker'} relative to your recent norm`,
    summary: `Split at your median of ${Math.floor(cut / 60)}h ${Math.round(cut % 60)}m: ${longer.length} sessions after longer sleep vs. ${shorter.length} after shorter. Median relative performance differed by ${pct(diff)}.`,
    startDay: rows[0].s.day,
    endDay: rows[rows.length - 1].s.day,
    n: rows.length,
    nLabel: 'sessions',
    evidence,
    effect: delta,
    effectLabel: delta != null ? `Cliff's δ ${delta.toFixed(2)} (${mag})` : null,
    metrics: [
      { label: 'Sleep split', value: `${Math.round(cut)} min` },
      { label: 'Longer-sleep sessions', value: `${longer.length}` },
      { label: 'Shorter-sleep sessions', value: `${shorter.length}` },
      { label: 'Median difference', value: pct(diff) },
    ],
    method: 'Relative performance = each exercise’s top-set e1RM ÷ its median over the previous 8 sessions of that exercise; a session’s value is the median over its exercises. Sleep = the watch’s total sleep for the night ending on the workout day.',
    alternatives: ['Short nights often coincide with busy, stressful or travel days that affect training too', 'Different workout types may fall on different days of the week', 'Illness can shorten sleep and reduce performance at the same time', 'This is an observed association, not evidence that sleep caused the difference'],
    links: [...longer.slice(-2), ...shorter.slice(-2)].map((r) => workoutLink(r.s, ds.aligned.has(r.s.workoutId))),
    score: score(evidence, delta),
  }
}

export function timeOfDayFinding(ds: AnalyticsDataset, opts: FindingOptions = {}): Finding {
  const perf = sessionPerformance(ds)
  const bucket = (h: number) => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening')
  const rows = sessionsFrom(ds, opts)
    .filter((s) => s.hourOfDay != null && perf.has(s.workoutId))
    .map((s) => ({ s, p: perf.get(s.workoutId)!, b: bucket(s.hourOfDay!) }))
  const id = 'time-of-day'
  const groups = new Map<string, typeof rows>()
  for (const r of rows) groups.set(r.b, [...(groups.get(r.b) ?? []), r])
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  if (sorted.length < 2 || sorted[1][1].length < 5)
    return insufficient(id, 'time-of-day', 'Time of day vs. performance', rows[0]?.s.day ?? ds.firstDay, ds.lastDay, rows.length, 'timed sessions', 'at least 5 comparable sessions in each of two parts of the day', 0.3)
  const [[aName, a], [bName, b]] = sorted
  const delta = cliffsDelta(a.map((r) => r.p), b.map((r) => r.p))
  const evidence = evidenceFor(Math.min(a.length, b.length), delta)
  const mag = delta != null ? magnitudeOf(delta) : 'negligible'
  return {
    id,
    kind: 'time-of-day',
    title: mag === 'negligible' ? `${cap(aName)} and ${bName} sessions perform similarly` : `${cap(delta! > 0 ? aName : bName)} sessions tended to be stronger relative to your norm`,
    summary: `${a.length} ${aName} vs. ${b.length} ${bName} sessions, each exercise compared with its own recent history.`,
    startDay: rows[0].s.day,
    endDay: rows[rows.length - 1].s.day,
    n: a.length + b.length,
    nLabel: 'sessions',
    evidence,
    effect: delta,
    effectLabel: delta != null ? `Cliff's δ ${delta.toFixed(2)} (${mag})` : null,
    metrics: [
      { label: `${cap(aName)} median`, value: pct(median(a.map((r) => r.p))! - 1) },
      { label: `${cap(bName)} median`, value: pct(median(b.map((r) => r.p))! - 1) },
    ],
    method: 'Session start from the Element 26 import or the linked Garmin activity. Morning < 12:00 ≤ afternoon < 17:00 ≤ evening. Performance as in the sleep analysis.',
    alternatives: ['Different workout types or exercises at different times of day', 'Meals, caffeine and work schedule vary with time of day', 'Weekend vs. weekday sessions'],
    links: [],
    score: score(evidence, delta),
  }
}

export function restRepsFinding(ds: AnalyticsDataset, opts: FindingOptions = {}): Finding {
  const pairs: { rest: number; repChange: number; day: string; workoutId: string }[] = []
  for (const w of ds.workouts) {
    if (opts.from && w.day < opts.from) continue
    const sets = [...w.sets].filter((s) => !s.isWarmup).sort((a, b) => a.order - b.order)
    for (let i = 1; i < sets.length; i++) {
      const prev = sets[i - 1]
      const cur = sets[i]
      if (cur.exercise !== prev.exercise || cur.restSecondsBefore == null || cur.weight == null || prev.weight == null) continue
      if (Math.abs(cur.weight - prev.weight) > Math.max(0.5, prev.weight * 0.01)) continue // same load only
      pairs.push({ rest: cur.restSecondsBefore, repChange: cur.reps - prev.reps, day: w.day, workoutId: w.id })
    }
  }
  const id = 'rest-reps'
  if (pairs.length < 10)
    return insufficient(id, 'rest-reps', 'Rest length vs. reps on the next set', pairs[0]?.day ?? ds.firstDay, ds.lastDay, pairs.length, 'set pairs', 'at least 10 consecutive same-load sets with reported rest (Element 26 imports)', 0.5)
  const { cut, high: longer, low: shorter } = splitAtMedian(pairs, (p) => p.rest)!
  if (Math.min(longer.length, shorter.length) < MIN_GROUP_N)
    return insufficient(id, 'rest-reps', 'Rest length vs. reps on the next set', pairs[0].day, ds.lastDay, pairs.length, 'set pairs', 'more variety in rest length (at least 5 pairs each above and below your median rest)', 0.5)
  const delta = cliffsDelta(longer.map((p) => p.repChange), shorter.map((p) => p.repChange))
  const evidence = evidenceFor(Math.min(longer.length, shorter.length), delta)
  const mag = delta != null ? magnitudeOf(delta) : 'negligible'
  const days = pairs.map((p) => p.day).sort()
  return {
    id,
    kind: 'rest-reps',
    title: mag === 'negligible' ? 'Rest length shows little relationship with reps kept on the next set' : `Longer rests were followed by ${delta! > 0 ? 'fewer' : 'more'} reps lost on the next set`,
    summary: `${pairs.length} consecutive same-load set pairs, split at your median rest of ${Math.round(cut)}s. Median rep change: ${median(longer.map((p) => p.repChange))} after longer rest vs. ${median(shorter.map((p) => p.repChange))} after shorter.`,
    startDay: days[0],
    endDay: days[days.length - 1],
    n: pairs.length,
    nLabel: 'set pairs',
    evidence,
    effect: delta,
    effectLabel: delta != null ? `Cliff's δ ${delta.toFixed(2)} (${mag})` : null,
    metrics: [
      { label: 'Rest split', value: `${Math.round(cut)}s` },
      { label: 'Pairs after longer rest', value: `${longer.length}` },
      { label: 'Pairs after shorter rest', value: `${shorter.length}` },
    ],
    method: 'Pairs of consecutive working sets of the same exercise at the same load (±1%). Rest = the rest Element 26 reported before the second set (app-tracked, not measured). Outcome = reps(second) − reps(first).',
    alternatives: ['Rest often gets longer later in an exercise, when fatigue is higher anyway', 'You may rest longer precisely when a set felt hard', 'Rep targets may change between sets'],
    links: [],
    score: score(evidence, delta),
  }
}

export function volumeRhrFinding(ds: AnalyticsDataset, opts: FindingOptions = {}): Finding {
  const weeks: { start: string; volume: number; nextRhr: number }[] = []
  const first = opts.from ?? ds.firstDay
  for (let start = first; addDays(start, 13) <= ds.lastDay; start = addDays(start, 7)) {
    const end = addDays(start, 6)
    const volume = ds.sessions.filter((s) => s.day >= start && s.day <= end).reduce((a, s) => a + s.volumeKg, 0)
    const rhr = ds.days.filter((d) => d.day > end && d.day <= addDays(end, 7) && d.restingHr != null).map((d) => d.restingHr as number)
    if (rhr.length >= 4) weeks.push({ start, volume, nextRhr: median(rhr)! })
  }
  const id = 'volume-rhr'
  const res = spearman(weeks.map((w) => [w.volume, w.nextRhr]))
  if (!res || res.n < 8 || weeks.every((w) => w.volume === 0))
    return insufficient(id, 'volume-rhr', 'Weekly training volume vs. next week’s resting HR', weeks[0]?.start ?? first, ds.lastDay, weeks.length, 'weeks', 'at least 8 weeks with logged training and resting-HR data', 0.3)
  const evidence = correlationEvidence(res.rho, res.n)
  const strong = Math.abs(res.rho) >= 0.2
  return {
    id,
    kind: 'volume-rhr',
    title: strong ? `Higher-volume weeks were followed by ${res.rho > 0 ? 'higher' : 'lower'} resting heart rate` : 'Weekly volume shows little relationship with the following week’s resting HR',
    summary: `${res.n} weeks of strength volume compared with the median resting HR of the week after (Spearman ρ = ${res.rho.toFixed(2)}).`,
    startDay: weeks[0].start,
    endDay: addDays(weeks[weeks.length - 1].start, 13),
    n: res.n,
    nLabel: 'weeks',
    evidence,
    effect: res.rho,
    effectLabel: `Spearman ρ ${res.rho.toFixed(2)}`,
    metrics: [{ label: 'Weeks', value: `${res.n}` }],
    method: 'Weekly volume = Σ load × reps of logged working sets (only workouts logged in BetterGarmin). Resting HR = median of the following 7 days.',
    alternatives: ['Cardio, work stress, sleep and illness also move resting HR', 'Weeks without logging count as zero volume', 'Correlation does not show which way any influence runs'],
    links: [],
    score: score(evidence, res.rho),
  }
}

export function hrResponseFindings(ds: AnalyticsDataset, opts: FindingOptions = {}): Finding[] {
  const byExercise = new Map<string, { day: string; workoutId: string; rises: number[]; peaks: number[]; load: number | null }[]>()
  for (const [workoutId, a] of ds.aligned) {
    if (!a.timeline || a.hrSource !== 'activity') continue
    const day = ds.workouts.find((w) => w.id === workoutId)?.day ?? ''
    if (opts.from && day < opts.from) continue
    const per = new Map<string, { rises: number[]; peaks: number[]; loads: number[] }>()
    for (const s of a.timeline.sets) {
      if (s.set.isWarmup || (s.confidence !== 'high' && s.confidence !== 'medium')) continue
      if (s.stats.peak == null || s.preSetHr == null) continue
      const e = per.get(s.set.exercise) ?? { rises: [], peaks: [], loads: [] }
      e.rises.push(s.stats.peak - s.preSetHr)
      e.peaks.push(s.stats.peak)
      if (s.set.weight != null) e.loads.push(s.set.weight)
      per.set(s.set.exercise, e)
    }
    for (const [ex, e] of per) byExercise.set(ex, [...(byExercise.get(ex) ?? []), { day, workoutId, rises: e.rises, peaks: e.peaks, load: median(e.loads) }])
  }
  const out: Finding[] = []
  for (const [exercise, sessions] of byExercise) {
    sessions.sort((a, b) => (a.day < b.day ? -1 : 1))
    const id = `hr-response:${exercise}`
    if (sessions.length < 4) {
      out.push(insufficient(id, 'hr-response', `${exercise}: heart-rate response`, sessions[0]?.day ?? ds.firstDay, ds.lastDay, sessions.length, 'sessions with reliable HR', `${4 - sessions.length} more session(s) of ${exercise} recorded with the watch`, 0.2))
      continue
    }
    const recent = sessions.slice(-2)
    const earlier = sessions.slice(0, -2)
    const delta = cliffsDelta(recent.flatMap((s) => s.rises), earlier.flatMap((s) => s.rises))
    const evidence = evidenceFor(Math.min(recent.flatMap((s) => s.rises).length, earlier.flatMap((s) => s.rises).length), delta)
    const mag = delta != null ? magnitudeOf(delta) : 'negligible'
    const loadNote =
      recent[0].load != null && earlier[0].load != null
        ? ` Typical load: ${median(earlier.map((s) => s.load ?? 0))} kg earlier vs. ${median(recent.map((s) => s.load ?? 0))} kg recently.`
        : ''
    out.push({
      id,
      kind: 'hr-response',
      title: mag === 'negligible' ? `${exercise}: heart-rate rise per set is unchanged` : `${exercise}: heart rate rises ${delta! > 0 ? 'more' : 'less'} per set than in earlier sessions`,
      summary: `Median rise (peak − pre-set HR) ${median(recent.flatMap((s) => s.rises))} bpm in the last 2 sessions vs. ${median(earlier.flatMap((s) => s.rises))} bpm before.${loadNote} Neither higher nor lower is inherently better.`,
      startDay: sessions[0].day,
      endDay: sessions[sessions.length - 1].day,
      n: sessions.length,
      nLabel: 'sessions',
      evidence,
      effect: delta,
      effectLabel: delta != null ? `Cliff's δ ${delta.toFixed(2)} (${mag})` : null,
      metrics: [
        { label: 'Recent median rise', value: `${median(recent.flatMap((s) => s.rises))} bpm` },
        { label: 'Earlier median rise', value: `${median(earlier.flatMap((s) => s.rises))} bpm` },
      ],
      method: 'Working sets with medium/high alignment confidence from watch-recorded activities only. Rise = peak HR in the set − mean HR over the 15 s before it.',
      alternatives: ['Load, reps, exercise order and rest length differ between sessions', 'Heat, caffeine, hydration and sensor fit all shift HR', 'Set starts are estimated unless corrected'],
      links: sessions.slice(-3).map((s) => workoutLink(s, true)),
      score: score(evidence, delta),
    })
  }
  return out
}

export function recoveryClusterFinding(recovery: RecoverySummary): Finding | null {
  const differing = recovery.indicators.filter((i) => i.lessRecoveredDirection === true)
  if (differing.length < 2) return null
  const sustained = differing.filter((i) => i.status === 'sustained').length
  const evidence: Evidence = sustained >= 2 ? 'moderate' : 'weak'
  return {
    id: 'recovery-cluster',
    kind: 'recovery-cluster',
    title: `${differing.length} recovery indicators differ from your usual at the same time`,
    summary: `${differing.map((i) => `${i.label} ${i.direction} your baseline`).join('; ')}. ${sustained > 0 ? `${sustained} of these have persisted for several days.` : 'None has persisted for several days yet.'} Coinciding changes are worth noticing — they don't identify a cause.`,
    startDay: addDays(recovery.asOf, -6),
    endDay: recovery.asOf,
    n: differing.length,
    nLabel: 'indicators',
    evidence,
    effect: null,
    effectLabel: null,
    metrics: differing.map((i) => ({ label: i.label, value: `${i.recent?.toFixed(i.unit === 'h' ? 1 : 0)} ${i.unit} (usual ${i.baseline?.median.toFixed(i.unit === 'h' ? 1 : 0)})` })),
    method: 'Last-7-day median vs. the 28 days before, robust z ≥ 1.5. "Several days" = ≥ 3 of the last 5 measured days beyond that threshold in the same direction.',
    alternatives: ['Illness, travel, alcohol, heat or work stress', 'Changes in training load', 'Ordinary variation — these metrics are noisy'],
    links: [{ label: 'History', to: '/insights?tab=history' }],
    score: 2 + sustained,
  }
}

export function routineChangeFinding(ds: AnalyticsDataset): Finding | null {
  const recentFrom = addDays(ds.lastDay, -27)
  const priorFrom = addDays(recentFrom, -28)
  const recent = ds.sessions.filter((s) => s.day >= recentFrom).length
  const prior = ds.sessions.filter((s) => s.day >= priorFrom && s.day < recentFrom).length
  if (prior + recent < 6) return null
  const perWeek = (n: number) => (n / 4).toFixed(1)
  const change = prior === 0 ? 1 : (recent - prior) / prior
  if (Math.abs(recent - prior) < 4 || Math.abs(change) < 0.4) return null
  return {
    id: 'routine-change',
    kind: 'routine-change',
    title: `Training frequency ${recent > prior ? 'increased' : 'decreased'} over the last 4 weeks`,
    summary: `${perWeek(recent)} logged sessions/week recently vs. ${perWeek(prior)} in the 4 weeks before. Other trends over this period may be related — or not.`,
    startDay: priorFrom,
    endDay: ds.lastDay,
    n: recent + prior,
    nLabel: 'sessions',
    evidence: 'moderate',
    effect: null,
    effectLabel: null,
    metrics: [
      { label: 'Recent 4 weeks', value: `${recent} sessions` },
      { label: 'Previous 4 weeks', value: `${prior} sessions` },
    ],
    method: 'Count of strength workouts logged in BetterGarmin, two consecutive 28-day windows.',
    alternatives: ['Unlogged sessions are not counted'],
    links: [{ label: 'Strength', to: '/training/strength' }],
    score: 1.5,
  }
}

function insufficient(id: string, kind: FindingKind, title: string, startDay: string, endDay: string, n: number, nLabel: string, needs: string, weight: number): Finding {
  return {
    id,
    kind,
    title,
    summary: `Not enough data yet (${n} ${nLabel}).`,
    startDay,
    endDay,
    n,
    nLabel,
    evidence: 'insufficient',
    effect: null,
    effectLabel: null,
    metrics: [],
    method: '',
    alternatives: [],
    links: [],
    needs,
    score: weight,
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function computeFindings(ds: AnalyticsDataset, recovery: RecoverySummary): Finding[] {
  const all: Finding[] = [
    ...progressionFindings(ds, recovery),
    sleepPerformanceFinding(ds),
    timeOfDayFinding(ds),
    restRepsFinding(ds),
    volumeRhrFinding(ds),
    ...hrResponseFindings(ds),
  ]
  const cluster = recoveryClusterFinding(recovery)
  if (cluster) all.push(cluster)
  const routine = routineChangeFinding(ds)
  if (routine) all.push(routine)
  return all.sort((a, b) => b.score - a.score)
}
