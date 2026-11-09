import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useAppearance, usesFullBackdrop, type WidgetId } from '../../app/appearance'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { MountainBackdrop } from '../../components/ui/MountainBackdrop'
import { MetricBlock } from '../../components/ui/MetricBlock'
import { formatHoursMinutes, hmsToMinutes } from '../../lib/duration'
import { StatNumber } from '../../components/ui/StatNumber'
import { Skeleton } from '../../components/ui/Skeleton'
import { getDailySummary, getHrv, getLatestDay, getLatestSleepDay, getSleep, getBandWakeEnergy, getBandEnergyNow } from '../../db/queries'
import type { DailySummaryRow, HrvRow, SleepRow } from '../../db/types'
import { buildTodayInsights } from './insights'
import { useData } from '../../app/DataProvider'
import { formatRelativeTime } from '../../lib/relativeTime'
import { useUnits } from '../../app/units'
import { convertDistance, distanceUnitLabel } from '../../lib/units'
import { LiveHeartRateCard } from './LiveHeartRateCard'
import { HowYouSlept } from './HowYouSlept'
import { useReadiness } from './useReadiness'
import { useEnergyReserve } from './useEnergyReserve'
import { TrainingWidget } from './TrainingWidget'
import { EnergyReserveCard } from './EnergyReserveCard'
import { EnergyForecastCard } from './EnergyForecastCard'
import { STATUS_LABELS, statusForInverseScore, statusForScore } from '../../lib/statusWords'

interface TodayData {
  day: string
  summary: DailySummaryRow | null
  sleep: SleepRow | null
  /** Body Battery on waking from the band, used when Garmin's daily figure isn't available. */
  wakeEnergy: number | null
  energyNow: number | null
  hrv: HrvRow | null
}

export function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)
  const { loadedKinds, lastSynced } = useData()
  const { units } = useUnits()
  const hasGarmin = loadedKinds.includes('garmin')
  const layout = useAppearance().todayLayout
  const readiness = useReadiness(data?.day ?? null, data?.sleep?.score ?? null)
  const energy = useEnergyReserve(data?.day ?? null, data?.summary?.bb_min ?? 55)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!hasGarmin) {
        if (!cancelled) {
          setData(null)
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const day = await getLatestDay()
      if (!day) {
        if (!cancelled) {
          setData(null)
          setLoading(false)
        }
        return
      }
      const latestSleep = await getLatestSleepDay()
      // Last night from the band can be newer than the rest of the data: show it rather than an older night.
      const sleepDay = latestSleep && latestSleep > day ? latestSleep : day
      const [summary, sleep, hrv, wakeEnergy, energyNow] = await Promise.all([getDailySummary(day), getSleep(sleepDay), getHrv(sleepDay), getBandWakeEnergy(sleepDay), getBandEnergyNow(day)])
      if (!cancelled) {
        setData({ day, summary, sleep, hrv, wakeEnergy, energyNow })
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasGarmin, lastSynced])

  if (loading) return <TodaySkeleton />

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <SyncBar />
        <LiveHeartRateCard />
        <Card className="text-center text-[var(--text-secondary)]">
          {hasGarmin
            ? 'No daily data found yet in your garmin.db.'
            : "No data loaded yet — garmin.db hasn't arrived. If cloud sync just connected, the first sync can take a few minutes."}
        </Card>
      </div>
    )
  }

  const { summary, sleep, hrv } = data
  const insights = buildTodayInsights(summary, sleep, hrv)
  const formattedDay = new Date(`${data.day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // The band's latest level first; then the level on waking. bb_charged (how much it charged) is only a last resort.
  const energyTile =
    data.energyNow != null
      ? { label: 'Energy now', value: data.energyNow }
      : data.wakeEnergy != null
        ? { label: 'Energy at wake', value: data.wakeEnergy }
        : { label: 'Energy', value: summary?.bb_charged || null }
  const widgets: Record<WidgetId, ReactNode> = {
    hero: <ReadinessHero atTop={layout.find((w) => w.visible)?.id === 'hero'} formattedDay={formattedDay} score={readiness?.score ?? null} recommendation={readiness?.recommendation ?? null} />,
    sync: (
      <>
        <SyncBar />
      </>
    ),
    training: <TrainingWidget />,
    heartRate: <LiveHeartRateCard />,
    bars: (
      <div className="grid grid-cols-2 gap-2.5">
        <MetricBlock
          metric="sleep"
          label="Sleep"
          value={sleep?.score != null ? String(sleep.score) : '—'}
          sub={formatHoursMinutes(hmsToMinutes(sleep?.total_sleep))}
          info={{ title: 'Sleep score', text: "Garmin's 0-100 score for last night, based on duration, sleep stages, and overnight resting heart rate. 80+ is great, 60-79 is good, below 60 means your body may need more recovery." }}
        />
        <MetricBlock
          metric="stress"
          label="Stress"
          value={summary?.stress_avg != null ? String(Math.round(summary.stress_avg)) : '—'}
          sub={statusWord(statusForInverseScore(summary?.stress_avg), 'average today')}
          info={{ title: 'Stress', text: "A 0-100 estimate of today's stress, from heart-rate variability relative to your resting heart rate. Below 25 is calm, 25-50 is typical daily stress, above 50 means your body is working harder than usual." }}
        />
        <MetricBlock
          // A missing or zero cloud figure (the cloud copy stops updating while Garmin Connect is off) yields to the band.
          metric="energy"
          label={energyTile.label}
          value={energyTile.value != null ? String(Math.round(energyTile.value)) : '—'}
          sub={statusWord(statusForScore(energyTile.value, [30, 50, 75]), 'Body Battery')}
          info={{ title: 'Energy Reserve (Garmin Body Battery)', text: "Garmin's own measure of your body's energy reserves, charged by rest and sleep and drained by stress and activity. “Energy now” is the latest level your band recorded; “Energy at wake” is the level it recorded when you woke up, read from its morning report." }}
        />
        <MetricBlock
          metric="neutral"
          label="Steps"
          value={compactCount(summary?.steps ?? 0)}
          sub={summary?.step_goal ? ((summary.steps ?? 0) >= summary.step_goal ? 'goal hit' : `of ${summary.step_goal.toLocaleString()}`) : undefined}
        />
      </div>
    ),
    forecast: <EnergyForecastCard day={data.day} />,
    energy: <EnergyReserveCard curve={energy.curve} biggestDrain={energy.biggestDrain} bestRecharge={energy.bestRecharge} />,
    stats: (
      // Steps lead in the colour blocks; the rest share one panel split by hairlines.
      <Card className="grid grid-cols-3 gap-px overflow-hidden bg-[var(--border-panel)] p-0">
        <StatCard label="Floors" value={summary?.floors_up ?? 0} />
        <StatCard label="Calories" value={summary?.calories_active ?? 0} />
        <StatCard
          label="Distance"
          value={convertDistance(summary?.distance ?? 0, units)}
          decimals={1}
          suffix={` ${distanceUnitLabel(units)}`}
        />
      </Card>
    ),
    lastNight: <HowYouSlept day={data.day} />,
    insights: (
      <>
      {insights.length > 0 && (
        <Card>
          <p className="mb-3 blk-label text-sm">Today's insights</p>
          <ul className="flex flex-col gap-3">
            {insights.map((insight, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="text-sm leading-relaxed text-[var(--text-secondary)]"
              >
                {insight}
              </motion.li>
            ))}
          </ul>
        </Card>
      )}
      </>
    ),
  }

  return (
    <div className="flex flex-col gap-6">
      {layout
        .filter((slot) => slot.visible)
        .map((slot) => (
          <Fragment key={slot.id}>{widgets[slot.id]}</Fragment>
        ))}
      <Link to="/customize" className="self-center text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
        Customize this screen
      </Link>
    </div>
  )
}

function ReadinessHero({
  atTop,
  formattedDay,
  score,
  recommendation,
}: {
  atTop: boolean
  formattedDay: string
  score: number | null
  recommendation: string | null
}) {
  const a = useAppearance()
  // A chosen backdrop photo shows as a band above the title, unless it already fills the whole page.
  const photoStrip = a.backgroundMode !== 'none' && !usesFullBackdrop(a)
  const status = statusForScore(score)

  return (
    <section className="flex flex-col gap-3">
      {photoStrip && (
        <div className={cn('-mx-4 h-28 overflow-hidden md:mx-0 md:rounded-card', atTop && '-mt-[calc(1.5rem+env(safe-area-inset-top))]')} aria-hidden>
          <MountainBackdrop height={112} />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">{formattedDay}</p>
          <SyncChip />
        </div>
        <h1 className="page-title">{greeting()}, here's today</h1>
      </div>
      <MetricBlock
        metric="readiness"
        label="Readiness"
        size="xl"
        value={score != null ? String(score) : '—'}
        sub={status ? `${STATUS_LABELS[status]}${recommendation ? ` · ${recommendation}` : ''}` : 'Needs a few days of history'}
        info={{
          title: 'Readiness (BetterGarmin estimate)',
          text: "Combines last night's sleep, resting heart rate vs. your baseline, recent training strain, and today's stress vs. your baseline.",
        }}
        className="min-h-56 p-5"
      >
        {score != null && <p className="absolute right-5 top-5 w-40 text-right text-[1.375rem] font-extrabold leading-tight tracking-tight">{verdict(score)}</p>}
      </MetricBlock>
    </section>
  )
}

/** The readiness score's own recommendation bands (src/scores/readiness.ts: 80 / 60 / 40), said in a few words. */
function verdict(score: number): string {
  if (score >= 80) return 'Go hard today.'
  if (score >= 60) return 'Normal training day.'
  if (score >= 40) return 'Easy session, not a PR day.'
  return 'Rest and recover.'
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
}

function statusWord(status: ReturnType<typeof statusForScore>, fallback: string): string {
  return status ? STATUS_LABELS[status] : fallback
}

/** 13170 -> "13.2k": the step count has to fit a half-width block at display size. */
function compactCount(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString()
}

function StatCard({
  label,
  value,
  goal,
  decimals = 0,
  suffix,
}: {
  label: string
  value: number
  goal?: number | null
  decimals?: number
  suffix?: string
}) {
  return (
    <div className="bg-[var(--bg-elevated)] p-4">
      <p className="blk-label text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 whitespace-nowrap text-2xl font-extrabold">
        <StatNumber value={value} decimals={decimals} suffix={suffix} />
      </p>
      {goal != null && <p className="text-xs text-[var(--text-tertiary)]">of {goal.toLocaleString()} goal</p>}
    </div>
  )
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-28 w-full" />
    </div>
  )
}

/** One-tap sync: straight from the band over Bluetooth, with the cloud copy as the fallback. */
/** Sync status messages (running, errors, notes, offline). The Sync now control itself sits in the hero as a chip. */
function SyncBar() {
  const { lastSynced, garminPull, online } = useData()
  const running = garminPull.status === 'running'
  const message = running
    ? garminPull.via === 'band'
      ? 'Syncing from your band…'
      : garminPull.afterBand ? 'Band synced · now updating the Garmin cloud backup (about 2 minutes)' : 'Downloading from Garmin… about 2 minutes'
    : !online && garminPull.status !== 'error'
      ? `Offline · saved data from ${formatRelativeTime(lastSynced)}`
      : garminPull.status === 'error'
        ? garminPull.message
        : garminPull.note ?? null
  if (!message) return null
  return <p className={cn('-mt-1 text-sm font-semibold', garminPull.status === 'error' ? 'text-[var(--tone-red)]' : 'text-[var(--text-secondary)]')}>{message}</p>
}

function SyncChip() {
  const { lastSynced, pullFromGarmin, garminPull, cloudStatus } = useData()
  const running = garminPull.status === 'running'
  return (
    <button
      type="button"
      onClick={() => pullFromGarmin()}
      disabled={running || cloudStatus === 'syncing'}
      aria-busy={running || undefined}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--text-primary)] px-3 py-1.5 text-xs font-bold text-[var(--bg-base)] disabled:opacity-60"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={running ? 'animate-spin' : undefined} aria-hidden>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
      </svg>
      {running ? 'Syncing…' : `Sync · ${formatRelativeTime(lastSynced)}`}
    </button>
  )
}

