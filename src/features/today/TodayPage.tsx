import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useAppearance, usesFullBackdrop, type WidgetId } from '../../app/appearance'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { RangeBar } from '../../components/ui/RangeBar'
import { MountainBackdrop } from '../../components/ui/MountainBackdrop'
import { TrailBlaze, TRAIL_GRADES, gradeForReadiness } from '../../components/ui/TrailBlaze'
import { StatNumber } from '../../components/ui/StatNumber'
import { Skeleton } from '../../components/ui/Skeleton'
import { InfoButton } from '../../components/ui/InfoButton'
import { METRIC_COLORS } from '../../components/ui/metricColors'
import { getDailySummary, getHrv, getLatestDay, getLatestSleepDay, getSleep, getBandWakeEnergy, getBandEnergyNow } from '../../db/queries'
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
import { EnergyForecastCard } from './EnergyForecastCard'
import { statusForInverseScore, statusForScore } from '../../lib/statusWords'

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
          // A missing or zero cloud figure (the cloud copy stops updating while Garmin Connect is off) yields to the band.
          label={energyTile.label}
          value={energyTile.value}
          status={statusForScore(energyTile.value, [30, 50, 75])}
          color={METRIC_COLORS.energy.solid}
          infoTitle="Energy Reserve (Garmin Body Battery)"
          infoDescription="Garmin's own measure of your body's energy reserves, charged by rest and sleep and drained by stress and activity. “Energy now” is the latest level your band recorded; “Energy at wake” is the level it recorded when you woke up, read from its morning report. See the curve below for BetterGarmin's own estimated intraday trace."
        />
      </Card>
    ),
    forecast: <EnergyForecastCard day={data.day} />,
    energy: <EnergyReserveCard curve={energy.curve} biggestDrain={energy.biggestDrain} bestRecharge={energy.bestRecharge} />,
    stats: (
      // One signboard split by hairlines, not four separate cards.
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-[var(--border-panel)] p-0 sm:grid-cols-4">
        <StatCard label="Steps" value={summary?.steps ?? 0} goal={summary?.step_goal} />
        <StatCard label="Floors" value={summary?.floors_up ?? 0} />
        <StatCard label="Active calories" value={summary?.calories_active ?? 0} />
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
          <p className="mb-3 sign-caps text-sm">Today's insights</p>
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
  const grade = gradeForReadiness(score)
  const a = useAppearance()
  // A chosen backdrop photo shows as a strip above the sign, unless it already fills the whole page.
  const photoStrip = a.backgroundMode !== 'none' && !usesFullBackdrop(a)

  return (
    <section className={cn('-mx-4 md:mx-0', atTop && '-mt-[calc(1.5rem+env(safe-area-inset-top))]')}>
      {photoStrip && (
        <div className="h-28 overflow-hidden" aria-hidden>
          <MountainBackdrop height={112} />
        </div>
      )}
      <div className={cn('sign-band flex items-baseline justify-between gap-3 px-4 pb-3 md:rounded-t-card', atTop && !photoStrip ? 'pt-[calc(env(safe-area-inset-top)+1rem)]' : 'pt-3')}>
        <h1 className="sign-caps text-lg">Today</h1>
        <p className="text-sm font-semibold opacity-80">{formattedDay}</p>
      </div>
      <div className="glass-panel flex flex-col gap-3 border-t-0 px-4 pb-5 pt-5 md:rounded-b-card">
        <div className="flex items-center gap-4">
          <TrailBlaze grade={grade} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-extrabold leading-tight">{grade ? TRAIL_GRADES[grade].name : 'No grade yet'}</p>
            <p className="text-sm font-semibold text-[var(--text-secondary)]">{grade ? TRAIL_GRADES[grade].effort : 'Readiness needs more history'}</p>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-5xl font-extrabold leading-none">{score ?? '–'}</span>
            <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-[var(--text-tertiary)]">
              Readiness
              <InfoButton title="Readiness (BetterGarmin estimate)">
                {`${recommendation ? recommendation + ' ' : ''}Combines last night's sleep, resting heart rate vs. your baseline, recent training strain, and today's stress vs. your baseline. The trail grade follows the same bands: 80+ black diamond, 60–79 blue square, 40–59 green circle, under 40 trail closed.`}
              </InfoButton>
            </span>
          </div>
        </div>
        {recommendation && <p className="border-t border-[var(--border-panel)] pt-3 text-sm text-[var(--text-secondary)]">{recommendation}</p>}
      </div>
    </section>
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
    <div className="bg-[var(--bg-elevated)] p-4">
      <p className="sign-caps text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-3xl font-extrabold">
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
function SyncBar() {
  const { lastSynced, pullFromGarmin, garminPull, cloudStatus, online } = useData()
  const running = garminPull.status === 'running'
  return (
    <div className="-mt-2 flex items-center justify-between gap-3 text-sm">
      <span className={garminPull.status === 'error' ? 'text-[var(--tone-red)]' : 'text-[var(--text-tertiary)]'}>
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

