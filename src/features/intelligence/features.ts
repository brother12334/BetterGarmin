import type { DayRecord } from '../analytics/model'
import { median } from '../analytics/robust'
import {
  MIN_SPREAD,
  baselineAt,
  capabilities,
  confidenceFrom,
  marker,
  mean,
  sd,
  theilSen,
  z,
  type Confidence,
  type MarkerKey,
  type Provenance,
} from './engine'

/**
 * Intelligence features. Each is a pure function of the daily records, returns an explicit state (ready,
 * calibrating, unavailable) and never fills a gap with a guess. Thresholds are documented engineering choices
 * unless a reference says otherwise; see docs/intelligence.md.
 */

export type InsightState = 'ready' | 'calibrating' | 'unavailable'
export type Maturity = 'established-method' | 'experimental'

export interface Contributor {
  label: string
  value: string
  /** Where it stands against the person's own baseline, in words. */
  note: string
  provenance: Provenance
  tone?: 'good' | 'neutral' | 'watch'
}

export interface HowItWorks {
  markers: MarkerKey[]
  estimates: string
  why: string
  limitations: string[]
  references: string[]
}

export interface Insight<V = unknown> {
  id: string
  title: string
  maturity: Maturity
  state: InsightState
  conclusion: string
  contributors: Contributor[]
  confidence: Confidence
  /** Newest day the conclusion uses. */
  asOf: string | null
  /** Feature-specific data for its visualisation. */
  view: V
  how: HowItWorks
}

const fmt = (v: number, d = 0) => v.toFixed(d)
const lastN = (days: DayRecord[], n: number) => days.slice(-n)

// ---- Recovery Momentum -----------------------------------------------------------------------------------

export interface MomentumView {
  markers: { key: MarkerKey; label: string; direction: 'toward' | 'away' | 'stable'; change: number; series: [string, number][]; baseline: number; band: [number, number] }[]
}

/**
 * Are HRV and resting HR moving toward or away from the personal baseline? The last 7 days' mean is compared with a
 * 28-day baseline that ends before them; a change counts only beyond half the baseline's spread (an adaptation of
 * the "smallest worthwhile change" used in HRV monitoring, Plews 2013 / Buchheit 2014).
 */
export function recoveryMomentum(days: DayRecord[]): Insight<MomentumView> {
  const out: MomentumView['markers'] = []
  const contributors: Contributor[] = []
  let worstConf: Confidence = 'high'
  const rank: Record<Confidence, number> = { insufficient: 0, low: 1, moderate: 2, high: 3 }
  for (const key of ['hrv', 'restingHr'] as const) {
    const m = marker(key)
    const end = days.length - 7
    const b = baselineAt(days, m, end, 28, MIN_SPREAD[key])
    const recent = days.slice(end).map(m.get).filter((v): v is number => v != null && v > 0)
    const conf = confidenceFrom(b?.n ?? 0, recent.length, 7)
    if (!b || recent.length < 4) {
      if (rank[conf] < rank[worstConf]) worstConf = conf
      continue
    }
    if (rank[conf] < rank[worstConf]) worstConf = conf
    const change = (mean(recent)! - b.median) * m.recoveredDirection
    const direction = Math.abs(change) < 0.5 * b.spread ? 'stable' : change > 0 ? 'toward' : 'away'
    const series = days.slice(-35).flatMap((d) => (m.get(d) ? [[d.day, m.get(d)!] as [string, number]] : []))
    out.push({ key, label: m.label, direction, change: change * m.recoveredDirection, series, baseline: b.median, band: [b.median - b.spread, b.median + b.spread] })
    contributors.push({
      label: m.label,
      value: `${fmt(mean(recent)!)} ${m.unit}`,
      note: direction === 'stable' ? `within your usual range (${fmt(b.median)} ± ${fmt(b.spread)})` : `${direction === 'toward' ? 'better' : 'worse'} than your usual ${fmt(b.median)} ${m.unit}`,
      provenance: m.provenance,
      tone: direction === 'toward' ? 'good' : direction === 'away' ? 'watch' : 'neutral',
    })
  }
  const how: HowItWorks = {
    markers: ['hrv', 'restingHr'],
    estimates: 'Whether your recovery markers this week are moving toward or away from your own usual level.',
    why: 'Overnight HRV and resting heart rate shift with recovery, training and illness; weekly averages against your own baseline separate real change from nightly noise.',
    limitations: ['A week of change can come from many causes, including training, alcohol, heat or travel.', 'Garmin’s overnight HRV is a device-calculated value, not raw beat-to-beat data.'],
    references: ['plews2013', 'buchheit2014', 'leys2013'],
  }
  if (!out.length)
    return { id: 'momentum', title: 'Recovery Momentum', maturity: 'established-method', state: days.length ? 'calibrating' : 'unavailable', conclusion: 'Needs about 4 weeks of HRV or resting heart rate to set your baseline.', contributors, confidence: 'insufficient', asOf: null, view: { markers: [] }, how }
  const away = out.filter((x) => x.direction === 'away').length
  const toward = out.filter((x) => x.direction === 'toward').length
  const conclusion =
    away && !toward ? 'Your recovery markers are drifting away from your usual level this week.' : toward && !away ? 'Your recovery markers are improving compared with your usual level.' : away && toward ? 'Mixed: one recovery marker is better than usual and one is worse.' : 'Your recovery markers are steady, within your usual range.'
  const asOf = [...days].reverse().find((d) => d.hrv || d.restingHr)?.day ?? null
  return { id: 'momentum', title: 'Recovery Momentum', maturity: 'established-method', state: 'ready', conclusion, contributors, confidence: worstConf, asOf, view: { markers: out }, how }
}

// ---- Circadian Intelligence ------------------------------------------------------------------------------

export interface CircadianView {
  nights: { day: string; start: number; end: number; free: boolean }[]
  midpointMean: number
}

/** Clock hour (0–24) of an epoch ms, in local time. */
const clockHour = (ms: number) => {
  const d = new Date(ms)
  return d.getHours() + d.getMinutes() / 60
}
/** Hours after noon, so a night doesn't wrap at midnight (23:00 → 11, 02:00 → 14). */
const afterNoon = (h: number) => (h >= 12 ? h - 12 : h + 12)
const fromAfterNoon = (h: number) => (h + 12) % 24
export const clockLabel = (h: number) => {
  const hh = Math.floor(h) % 24
  const mm = Math.round((h - Math.floor(h)) * 60)
  return new Date(2000, 0, 1, hh, mm === 60 ? 59 : mm).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * Sleep timing and its regularity over the last 14 nights: mean sleep midpoint, the spread of bedtimes and wake
 * times, and social jetlag (free-day minus work-day midpoint; Wittmann 2006). Free days are taken to be nights
 * before Saturday and Sunday, since actual work days aren't known.
 */
export function circadian(days: DayRecord[]): Insight<CircadianView> {
  const nights = lastN(days, 14).flatMap((d) => (d.sleepStartMs && d.sleepEndMs && d.sleepEndMs > d.sleepStartMs ? [d] : []))
  const how: HowItWorks = {
    markers: ['sleepTiming'],
    estimates: 'When you sleep and how regular that timing is from night to night.',
    why: 'Irregular sleep timing is linked with worse outcomes independently of how long you sleep, and a shift between work and free days ("social jetlag") is a common, measurable form of it.',
    limitations: [
      'Uses sleep start and end only. The Sleep Regularity Index needs minute-by-minute sleep/wake data, which isn’t available, so regularity here is the spread of bed and wake times.',
      'Free days are assumed to be Friday and Saturday nights.',
      'This describes sleep timing; it does not measure your internal body clock.',
    ],
    references: ['wittmann2006', 'phillips2017'],
  }
  if (nights.length < 7)
    return { id: 'circadian', title: 'Circadian Rhythm', maturity: 'established-method', state: nights.length ? 'calibrating' : 'unavailable', conclusion: `Needs at least 7 recorded nights in the last two weeks (has ${nights.length}).`, contributors: [], confidence: 'insufficient', asOf: null, view: { nights: [], midpointMean: 0 }, how }
  const rows = nights.map((d) => {
    const s = afterNoon(clockHour(d.sleepStartMs!))
    const e = afterNoon(clockHour(d.sleepEndMs!))
    const wakeDow = new Date(d.sleepEndMs!).getDay()
    return { day: d.day, start: s, end: e < s ? e + 24 : e, mid: (s + (e < s ? e + 24 : e)) / 2, free: wakeDow === 0 || wakeDow === 6 }
  })
  const midMean = mean(rows.map((r) => r.mid))!
  const onsetSd = sd(rows.map((r) => r.start))!
  const wakeSd = sd(rows.map((r) => r.end))!
  const free = rows.filter((r) => r.free)
  const work = rows.filter((r) => !r.free)
  const jetlag = free.length >= 2 && work.length >= 3 ? mean(free.map((r) => r.mid))! - mean(work.map((r) => r.mid))! : null
  const regular = onsetSd <= 0.75 && wakeSd <= 0.75
  const conclusion = regular
    ? `Your sleep timing is regular, centred around ${clockLabel(fromAfterNoon(midMean))}.`
    : `Your bed and wake times vary by about ${fmt(Math.max(onsetSd, wakeSd), 1)} hours from night to night.`
  const contributors: Contributor[] = [
    { label: 'Usual sleep midpoint', value: clockLabel(fromAfterNoon(midMean)), note: `over ${rows.length} nights`, provenance: 'betterGarmin' },
    { label: 'Bedtime variation', value: `± ${Math.round(onsetSd * 60)} min`, note: onsetSd <= 0.75 ? 'consistent' : 'irregular', provenance: 'betterGarmin', tone: onsetSd <= 0.75 ? 'good' : 'watch' },
    { label: 'Wake time variation', value: `± ${Math.round(wakeSd * 60)} min`, note: wakeSd <= 0.75 ? 'consistent' : 'irregular', provenance: 'betterGarmin', tone: wakeSd <= 0.75 ? 'good' : 'watch' },
  ]
  if (jetlag != null)
    contributors.push({ label: 'Social jetlag', value: `${fmt(Math.abs(jetlag), 1)} h`, note: `weekend sleep is ${jetlag >= 0 ? 'later' : 'earlier'} than weekdays`, provenance: 'betterGarmin', tone: Math.abs(jetlag) >= 1 ? 'watch' : 'neutral' })
  return {
    id: 'circadian',
    title: 'Circadian Rhythm',
    maturity: 'established-method',
    state: 'ready',
    conclusion,
    contributors,
    confidence: rows.length >= 12 ? 'high' : rows.length >= 9 ? 'moderate' : 'low',
    asOf: nights[nights.length - 1].day,
    view: { nights: rows.map((r) => ({ day: r.day, start: fromAfterNoon(r.start), end: fromAfterNoon(r.end % 24), free: r.free })), midpointMean: fromAfterNoon(midMean) },
    how,
  }
}

// ---- Sleep Debt ------------------------------------------------------------------------------------------

export interface SleepDebtView {
  nights: { day: string; minutes: number | null; shortfall: number }[]
  referenceMinutes: number
}

/** The consensus minimum for adults (AASM/SRS, Watson 2015). Used as the reference, not as a personal need. */
export const SLEEP_REFERENCE_MIN = 7 * 60

/**
 * Accumulated shortfall below 7 hours over the last 7 and 14 nights. "Interest" is a metaphor for the finding that
 * repeated short nights add up (Van Dongen 2003); no repayment schedule is implied.
 */
export function sleepDebt(days: DayRecord[]): Insight<SleepDebtView> {
  const window = lastN(days, 14)
  const nights = window.map((d) => ({ day: d.day, minutes: d.sleepMinutes && d.sleepMinutes > 0 ? d.sleepMinutes : null, shortfall: d.sleepMinutes && d.sleepMinutes > 0 ? Math.max(0, SLEEP_REFERENCE_MIN - d.sleepMinutes) : 0 }))
  const recorded = nights.filter((n) => n.minutes != null)
  const how: HowItWorks = {
    markers: ['sleepMinutes'],
    estimates: 'How far your recent sleep fell short of 7 hours, added up over one and two weeks.',
    why: 'Adults are advised to sleep at least 7 hours, and the effects of repeated short nights build up and are easy to underestimate.',
    limitations: [
      '7 hours is a population minimum, not your personal need; some people need more.',
      'Nights without a recording are left out, not assumed to be short.',
      'Sleeping longer later does not cancel debt hour-for-hour; this shows the shortfall, not a repayment plan.',
    ],
    references: ['watson2015', 'vandongen2003'],
  }
  if (recorded.length < 5)
    return { id: 'sleepDebt', title: 'Sleep Debt', maturity: 'established-method', state: recorded.length ? 'calibrating' : 'unavailable', conclusion: `Needs at least 5 recorded nights in the last two weeks (has ${recorded.length}).`, contributors: [], confidence: 'insufficient', asOf: null, view: { nights, referenceMinutes: SLEEP_REFERENCE_MIN }, how }
  const last7 = nights.slice(-7)
  const debt7 = last7.reduce((a, n) => a + n.shortfall, 0)
  const debt14 = nights.reduce((a, n) => a + n.shortfall, 0)
  const short7 = last7.filter((n) => n.minutes != null && n.minutes < SLEEP_REFERENCE_MIN).length
  const hm = (m: number) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`
  const conclusion = debt7 < 60 ? 'You’ve slept close to 7 hours or more on most recent nights.' : `You’re about ${hm(debt7)} short of 7 hours a night over the past week.`
  return {
    id: 'sleepDebt',
    title: 'Sleep Debt',
    maturity: 'established-method',
    state: 'ready',
    conclusion,
    contributors: [
      { label: 'Past 7 nights', value: hm(debt7), note: `${short7} night${short7 === 1 ? '' : 's'} under 7 h`, provenance: 'betterGarmin', tone: debt7 >= 180 ? 'watch' : 'neutral' },
      { label: 'Past 14 nights', value: hm(debt14), note: `${recorded.length} nights recorded`, provenance: 'betterGarmin' },
      { label: 'Average sleep', value: hm(mean(recorded.map((n) => n.minutes!))!), note: 'recorded nights', provenance: 'garmin-derived' },
    ],
    confidence: recorded.length >= 12 ? 'high' : recorded.length >= 9 ? 'moderate' : 'low',
    asOf: [...recorded].pop()!.day,
    view: { nights, referenceMinutes: SLEEP_REFERENCE_MIN },
    how,
  }
}

// ---- Health Trajectory -----------------------------------------------------------------------------------

export interface TrajectoryDomain {
  key: MarkerKey
  label: string
  unit: string
  windows: { days: 30 | 90 | 180; change: number | null; trend: 'rising' | 'falling' | 'stable' | 'insufficient'; n: number }[]
  series: [string, number][]
}

/**
 * Long-term change per domain, never combined into one health number. Trend = Theil–Sen slope × window length; it
 * counts as a change only beyond half the marker's typical day-to-day spread and with at least 40% day coverage.
 */
export function healthTrajectory(days: DayRecord[]): Insight<{ domains: TrajectoryDomain[] }> {
  const keys: MarkerKey[] = ['restingHr', 'hrv', 'sleepMinutes', 'steps', 'spo2', 'respiration']
  const caps = capabilities(days)
  const domains: TrajectoryDomain[] = []
  for (const key of keys) {
    if (!caps[key].available) continue
    const m = marker(key)
    const windows = ([30, 90, 180] as const).map((w) => {
      const pts = lastN(days, w).flatMap((d, i) => (m.get(d) && m.get(d)! > 0 ? [[i, m.get(d)!] as [number, number]] : []))
      if (pts.length < Math.max(10, w * 0.4)) return { days: w, change: null, trend: 'insufficient' as const, n: pts.length }
      const slope = theilSen(pts)!
      const vals = pts.map((p) => p[1])
      const spread = Math.max((median(vals.map((v) => Math.abs(v - median(vals)!))) ?? 0) * 1.4826, MIN_SPREAD[key] ?? 0)
      const change = slope * w
      return { days: w, change, trend: Math.abs(change) < 0.5 * spread ? ('stable' as const) : change > 0 ? ('rising' as const) : ('falling' as const), n: pts.length }
    })
    domains.push({ key, label: m.label, unit: m.unit, windows, series: lastN(days, 180).flatMap((d) => (m.get(d) && m.get(d)! > 0 ? [[d.day, m.get(d)!] as [string, number]] : [])) })
  }
  const how: HowItWorks = {
    markers: keys,
    estimates: 'Whether each measurement has been rising, falling or holding steady over 30, 90 and 180 days.',
    why: 'Slow changes in resting heart rate, HRV, sleep and activity are easier to see over months than day to day. Each is kept separate, since there’s no validated way to combine them into one health score.',
    limitations: ['Changes of device, firmware or wearing habits can shift values.', 'A trend is a description, not an explanation or a diagnosis.'],
    references: ['sen1968', 'leys2013'],
  }
  const usable = domains.filter((d) => d.windows.some((w) => w.trend !== 'insufficient'))
  if (!usable.length)
    return { id: 'trajectory', title: 'Health Trajectory', maturity: 'established-method', state: domains.length ? 'calibrating' : 'unavailable', conclusion: 'Needs at least a few weeks of data in one area.', contributors: [], confidence: 'insufficient', asOf: null, view: { domains }, how }
  const changed = usable.flatMap((d) => {
    const w = d.windows.find((x) => x.days === 90 && x.trend !== 'insufficient') ?? d.windows.find((x) => x.trend !== 'insufficient')!
    return w.trend === 'rising' || w.trend === 'falling' ? [`${d.label.toLowerCase()} ${w.trend}`] : []
  })
  const conclusion = changed.length ? `Over recent months: ${changed.slice(0, 3).join(', ')}.` : 'Your long-term measurements are holding steady.'
  const contributors: Contributor[] = usable.map((d) => {
    const w = d.windows.find((x) => x.days === 90 && x.trend !== 'insufficient') ?? d.windows.find((x) => x.trend !== 'insufficient')!
    return { label: d.label, value: w.change == null ? '—' : `${w.change > 0 ? '+' : ''}${fmt(w.change, d.key === 'spo2' || d.key === 'respiration' ? 1 : 0)} ${d.unit}`, note: `${w.trend} over ${w.days} days`, provenance: marker(d.key).provenance }
  })
  const n = Math.max(...usable.map((d) => d.windows.find((w) => w.trend !== 'insufficient')!.n))
  return { id: 'trajectory', title: 'Health Trajectory', maturity: 'established-method', state: 'ready', conclusion, contributors, confidence: n >= 120 ? 'high' : n >= 60 ? 'moderate' : 'low', asOf: days[days.length - 1]?.day ?? null, view: { domains }, how }
}

// ---- Illness Radar ---------------------------------------------------------------------------------------

export interface RadarView {
  days: { day: string; outside: MarkerKey[] }[]
  status: 'normal' | 'elevated' | 'insufficient'
}

/** Markers watched, each in the direction that tends to accompany illness or heavy strain. */
const RADAR: { key: MarkerKey; sign: 1 | -1 }[] = [
  { key: 'restingHr', sign: 1 },
  { key: 'hrv', sign: -1 },
  { key: 'respiration', sign: 1 },
  { key: 'awake', sign: 1 },
  { key: 'spo2', sign: -1 },
]
/** Deviation needed for a marker to count as outside its usual range (robust z, engineering choice). */
export const RADAR_Z = 2

/**
 * Multivariate baseline deviation over the last 3 days. "Elevated" needs at least two markers outside their usual
 * range on the same day, one of them resting HR or HRV, since single-signal flags are mostly false positives
 * (Mishra 2020, Quer 2021). It never diagnoses or gives a probability.
 */
export function illnessRadar(days: DayRecord[]): Insight<RadarView> {
  const how: HowItWorks = {
    markers: RADAR.map((r) => r.key),
    estimates: 'Whether several of your body’s signals are outside their usual range at the same time.',
    why: 'Infections and other strains often raise resting heart rate, lower HRV, speed up breathing and disturb sleep. Requiring several signals at once filters out most ordinary bad nights.',
    limitations: [
      'Hard training, alcohol, heat, travel and poor sleep cause the same changes.',
      'Skin temperature isn’t used: the band’s readings so far have been empty.',
      'This is not a diagnosis and gives no probability of being ill.',
    ],
    references: ['radin2020', 'mishra2020', 'quer2021', 'leys2013'],
  }
  const n = days.length
  const evaluated: RadarView['days'] = []
  const latestOutside: { key: MarkerKey; zv: number; value: number; median: number }[] = []
  let baselines = 0
  for (let i = Math.max(0, n - 3); i < n; i++) {
    const outside: MarkerKey[] = []
    for (const r of RADAR) {
      const m = marker(r.key)
      const v = m.get(days[i])
      const b = baselineAt(days, m, i, 28, MIN_SPREAD[r.key])
      if (!b || v == null || v <= 0) continue
      if (i === n - 1) baselines++
      const zv = z(v, b) * r.sign
      if (zv >= RADAR_Z) {
        outside.push(r.key)
        if (i === n - 1) latestOutside.push({ key: r.key, zv, value: v, median: b.median })
      }
    }
    evaluated.push({ day: days[i].day, outside })
  }
  const hasCore = (o: MarkerKey[]) => o.includes('restingHr') || o.includes('hrv')
  const flagged = evaluated.filter((d) => d.outside.length >= 2 && hasCore(d.outside))
  const coreBaseline = ['restingHr', 'hrv'].some((k) => baselineAt(days, marker(k as MarkerKey), n - 1, 28, MIN_SPREAD[k as MarkerKey]))
  if (!coreBaseline)
    return { id: 'radar', title: 'Illness Radar', maturity: 'experimental', state: n ? 'calibrating' : 'unavailable', conclusion: 'Needs about 4 weeks of resting heart rate or HRV before it can compare.', contributors: [], confidence: 'insufficient', asOf: null, view: { days: evaluated, status: 'insufficient' }, how }
  const status = flagged.length ? 'elevated' : 'normal'
  const conclusion = status === 'elevated' ? `${flagged.length > 1 ? `For ${flagged.length} of the last 3 days, s` : 'S'}everal of your signals have been outside their usual range at once. Worth noticing how you feel.` : 'Your signals are within their usual ranges.'
  const contributors: Contributor[] = latestOutside.map((o) => {
    const m = marker(o.key)
    return { label: m.label, value: `${fmt(o.value, o.key === 'respiration' || o.key === 'spo2' ? 1 : 0)} ${m.unit}`, note: `usual ${fmt(o.median, o.key === 'respiration' || o.key === 'spo2' ? 1 : 0)}`, provenance: m.provenance, tone: 'watch' }
  })
  return { id: 'radar', title: 'Illness Radar', maturity: 'experimental', state: 'ready', conclusion, contributors, confidence: baselines >= 3 ? 'moderate' : 'low', asOf: days[n - 1].day, view: { days: evaluated, status }, how }
}

// ---- True Energy (research prototype) --------------------------------------------------------------------

export interface EnergyView {
  components: { label: string; z: number | null }[]
  overall: 'above' | 'usual' | 'below' | null
}

/**
 * Overnight recovery compared with your own usual nights, shown component by component. No single energy number is
 * produced: no published, validated model turns these inputs into an energy level, and copying Garmin's Body
 * Battery would not be independent.
 */
export function trueEnergy(days: DayRecord[]): Insight<EnergyView> {
  const n = days.length
  const comps: { key: MarkerKey; label: string }[] = [
    { key: 'hrv', label: 'Overnight HRV' },
    { key: 'restingHr', label: 'Resting heart rate' },
    { key: 'sleepMinutes', label: 'Sleep duration' },
    { key: 'awake', label: 'Awake time in bed' },
  ]
  const latest = days[n - 1]
  const components = comps.map((c) => {
    const m = marker(c.key)
    const v = latest ? m.get(latest) : null
    const b = baselineAt(days, m, n - 1, 28, MIN_SPREAD[c.key])
    return { label: c.label, z: v != null && v > 0 && b ? z(v, b) * m.recoveredDirection : null, value: v, median: b?.median ?? null, unit: m.unit, provenance: m.provenance }
  })
  const scored = components.filter((c) => c.z != null)
  const how: HowItWorks = {
    markers: comps.map((c) => c.key),
    estimates: 'How last night’s recovery compares with your usual nights, one signal at a time.',
    why: 'HRV, resting heart rate and sleep are the overnight signals most consistently linked with recovery. Seeing them separately shows what is driving the picture.',
    limitations: ['Research prototype: no validated energy score is produced.', 'Daytime demands (activity, stress) aren’t included yet, since the band hasn’t provided all-day data.'],
    references: ['plews2013', 'buchheit2014', 'watson2015'],
  }
  if (scored.length < 2)
    return { id: 'energy', title: 'True Energy', maturity: 'experimental', state: n ? 'calibrating' : 'unavailable', conclusion: 'Needs a few weeks of overnight data to compare against.', contributors: [], confidence: 'insufficient', asOf: null, view: { components: components.map((c) => ({ label: c.label, z: c.z })), overall: null }, how }
  const above = scored.filter((c) => c.z! >= 1).length
  const below = scored.filter((c) => c.z! <= -1).length
  const overall = above >= 2 && !below ? 'above' : below >= 2 && !above ? 'below' : 'usual'
  const conclusion = overall === 'above' ? 'Last night looks like better recovery than your usual night.' : overall === 'below' ? 'Last night looks like weaker recovery than your usual night.' : 'Last night’s recovery looks like a typical night for you.'
  return {
    id: 'energy',
    title: 'True Energy',
    maturity: 'experimental',
    state: 'ready',
    conclusion,
    contributors: scored.map((c) => ({
      label: c.label,
      value: `${fmt(c.value!, 0)} ${c.unit}`,
      note: Math.abs(c.z!) < 1 ? 'usual for you' : c.z! > 0 ? 'better than usual' : 'worse than usual',
      provenance: c.provenance,
      tone: Math.abs(c.z!) < 1 ? 'neutral' : c.z! > 0 ? 'good' : 'watch',
    })),
    confidence: scored.length >= 4 ? 'moderate' : 'low',
    asOf: latest.day,
    view: { components: components.map((c) => ({ label: c.label, z: c.z })), overall },
    how,
  }
}

export function allInsights(days: DayRecord[]): Insight[] {
  return [trueEnergy(days), illnessRadar(days), recoveryMomentum(days), circadian(days), sleepDebt(days), healthTrajectory(days)]
}
