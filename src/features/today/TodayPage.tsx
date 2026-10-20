import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useAppearance, usesFullBackdrop, type WidgetId } from '../../app/appearance'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Ring } from '../../components/ui/Ring'
import { RangeBar } from '../../components/ui/RangeBar'
import { MountainBackdrop } from '../../components/ui/MountainBackdrop'
import { StatNumber } from '../../components/ui/StatNumber'
import { Skeleton } from '../../components/ui/Skeleton'
import { InfoButton } from '../../components/ui/InfoButton'
import { METRIC_COLORS } from '../../components/ui/metricColors'
import { getDailySummary, getHrv, getLatestDay, getLatestSleepDay, getSleep } from '../../db/queries'
import type { DailySummaryRow, HrvRow, SleepRow } from '../../db/types'
import { buildTodayInsights } from './insights'
import { useData } from '../../app/DataProvider'
import { Button } from '../../components/ui/Button'
import { formatRelativeTime } from '../../lib/relativeTime'
import { useUnits } from '../../app/units'
import { convertDistance, distanceUnitLabel } from '../../lib/units'
import { LiveHeartRateCard } from './LiveHeartRateCard'
import { HowYouSlept } from './HowYouSlept'
import { useReadiness } from './useReadiness'
import { useEnergyReserve } from './useEnergyReserve'
import { TrainingWidget } from './TrainingWidget'
import { EnergyReserveCard } from './EnergyReserveCard'
import { STATUS_COLORS, STATUS_LABELS, statusForInverseScore, statusForScore } from '../../lib/statusWords'

interface TodayData {
  day: string
  summary: DailySummaryRow | null
  sleep: SleepRow | null
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
      const [summary, sleep, hrv] = await Promise.all([getDailySummary(day), getSleep(sleepDay), getHrv(sleepDay)])
      if (!cancelled) {
        setData({ day, summary, sleep, hrv })
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

  const widgets: Record<WidgetId, ReactNode> = {
    hero: <ReadinessHero atTop={layout.find((w) => w.visible)?.id === 'hero'} formattedDay={formattedDay} score={readiness?.score ?? null} recommendation={readiness?.recommendation ?? null} />,
    sync: <SyncBar />,
    training: <TrainingWidget />,
    heartRate: <LiveHeartRateCard />,
    bars: (
      <Card className="divide-y divide-[var(--border-panel)] py-1">
        <RangeBar
          label="Sleep"
          value={sleep?.score ?? null}
          status={statusForScore(sleep?.score, [50, 70, 85])}
          color={METRIC_COLORS.sleep.solid}
          infoTitle="Sleep score"
          infoDescription="Garmin's 0-100 score for last night, based on duration, sleep stages, and overnight resting heart rate. 80+ is great, 60-79 is good, below 60 means your body may need more recovery."
        />
        <RangeBar
          label="Stress"
          value={summary?.stress_avg ?? null}
          status={statusForInverseScore(summary?.stress_avg)}
          color={METRIC_COLORS.stress.solid}
          infoTitle="Stress"
          infoDescription="A 0-100 estimate of today's stress, from heart-rate variability relative to your resting heart rate. Below 25 is calm, 25-50 is typical daily stress, above 50 means your body is working harder than usual."
        />
        <RangeBar
          label="Energy"
          value={summary?.bb_charged ?? null}
          status={statusForScore(summary?.bb_charged, [30, 50, 75])}
          color={METRIC_COLORS.energy.solid}
          infoTitle="Energy Reserve (Garmin Body Battery)"
          infoDescription="Garmin's own measure of your body's energy reserves, charged by rest and sleep and drained by stress and activity. See the curve below for BetterGarmin's own estimated intraday trace."
        />
      </Card>
    ),
    energy: <EnergyReserveCard curve={energy.curve} biggestDrain={energy.biggestDrain} bestRecharge={energy.bestRecharge} />,
    stats: (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Steps" value={summary?.steps ?? 0} goal={summary?.step_goal} />
        <StatCard label="Floors" value={summary?.floors_up ?? 0} suffix=" fl" />
        <StatCard label="Active calories" value={summary?.calories_active ?? 0} />
        <StatCard
          label="Distance"
          value={convertDistance(summary?.distance ?? 0, units)}
          decimals={1}
          suffix={` ${distanceUnitLabel(units)}`}
        />
      </div>
    ),
    lastNight: <HowYouSlept day={data.day} />,
    insights: (
      <>
      {insights.length > 0 && (
        <Card>
          <p className="mb-3 font-semibold">Today's insights</p>
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
  const status = statusForScore(score)
  const color = status ? STATUS_COLORS[status] : METRIC_COLORS.readiness.solid
  // With a full-screen backdrop the page itself already shows it, so the hero stays transparent.
  const fullPage = usesFullBackdrop(useAppearance())

  return (
    <div className={cn('relative -mx-4 overflow-hidden md:-mx-8', atTop ? '-mt-[calc(1.5rem+env(safe-area-inset-top))] rounded-b-card pt-[env(safe-area-inset-top)]' : 'rounded-card')}>
      {!fullPage && (
        <div className="absolute inset-0">
          <MountainBackdrop height={320} />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-base)] from-25% via-[var(--bg-base)]/70 via-60% to-transparent" />
        </div>
      )}
      <div className="relative flex flex-col gap-5 px-4 pb-8 pt-6 md:px-8">
        <div>
          <h1 className="text-2xl font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">Today</h1>
          <p className="text-sm text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{formattedDay}</p>
        </div>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full" style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))' }}>
            <Ring value={score} metric="readiness" size={176} strokeWidth={14} />
          </div>
          <div className="flex max-w-xs flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
                {status ? STATUS_LABELS[status] : 'Readiness'}
              </span>
              <InfoButton title="Readiness (BetterGarmin estimate)">
                {recommendation
                  ? `${recommendation} Combines last night's sleep, resting heart rate vs. your baseline, recent training strain, and today's stress vs. your baseline.`
                  : "BetterGarmin's recovery/readiness score, combining sleep, resting heart rate, training load, and stress. Needs a bit more history to establish your personal baseline."}
              </InfoButton>
            </div>
            {recommendation && (
              // Without a full-page photo this line sits where the hero fades into the page, so it uses the theme's text colour.
              <p className={cn('text-sm leading-relaxed', fullPage ? 'text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]' : 'text-[var(--text-secondary)]')}>{recommendation}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
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
    <Card className="p-4">
      <p className="text-xs font-medium text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        <StatNumber value={value} decimals={decimals} suffix={suffix} />
      </p>
      {goal != null && <p className="text-xs text-[var(--text-tertiary)]">of {goal.toLocaleString()} goal</p>}
    </Card>
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
function SyncBar() {
  const { lastSynced, pullFromGarmin, garminPull, cloudStatus, online } = useData()
  const running = garminPull.status === 'running'
  return (
    <div className="-mt-2 flex items-center justify-between gap-3 text-sm">
      <span className={garminPull.status === 'error' ? 'text-rose-400' : 'text-[var(--text-tertiary)]'}>
        {running
          ? garminPull.via === 'band'
            ? 'Syncing from your band…'
            : garminPull.afterBand ? 'Band synced · now updating the Garmin cloud backup (about 2 minutes)' : 'Downloading from Garmin… about 2 minutes'
          : !online && garminPull.status !== 'error'
          ? `Offline · saved data from ${formatRelativeTime(lastSynced)}`
          : garminPull.status === 'error'
            ? garminPull.message
            : garminPull.note ?? `Synced ${formatRelativeTime(lastSynced)}`}
      </span>
      <Button loading={running} variant="secondary" onClick={() => pullFromGarmin()} disabled={running || cloudStatus === 'syncing'} className="shrink-0">
        {running ? 'Syncing…' : 'Sync now'}
      </Button>
    </div>
  )
}
