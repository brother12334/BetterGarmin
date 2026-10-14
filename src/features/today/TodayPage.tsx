import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Ring } from '../../components/ui/Ring'
import { StatNumber } from '../../components/ui/StatNumber'
import { Skeleton } from '../../components/ui/Skeleton'
import { InfoButton } from '../../components/ui/InfoButton'
import { getDailySummary, getHrv, getLatestDay, getSleep } from '../../db/queries'
import type { DailySummaryRow, HrvRow, SleepRow } from '../../db/types'
import { buildTodayInsights } from './insights'
import { hmsToMinutes, formatHoursMinutes } from '../../lib/duration'
import { SparkleIcon } from '../../app/icons'
import { useData } from '../../app/DataProvider'
import { LiveHeartRateCard } from './LiveHeartRateCard'

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
  const hasGarmin = loadedKinds.includes('garmin')

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
      const [summary, sleep, hrv] = await Promise.all([getDailySummary(day), getSleep(day), getHrv(day)])
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="text-sm text-[var(--text-secondary)]">{formattedDay}</p>
      </div>

      <LiveHeartRateCard />

      <Card>
        <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4">
          <HeroRing
            metric="sleep"
            value={sleep?.score ?? null}
            label="Sleep"
            title="Sleep score"
            description="Garmin's 0-100 score for last night, based on duration, sleep stages, and overnight resting heart rate. 80+ is great, 60-79 is good, below 60 means your body may need more recovery."
          />
          <HeroRing
            metric="stress"
            value={summary?.stress_avg ?? null}
            label="Stress"
            title="Stress"
            description="A 0-100 estimate of today's stress, from heart-rate variability relative to your resting heart rate. Below 25 is calm, 25-50 is typical daily stress, above 50 means your body is working harder than usual."
          />
          <HeroRing
            metric="energy"
            value={summary?.bb_charged ?? null}
            label="Energy"
            title="Energy Reserve (Garmin Body Battery)"
            description="Garmin's own measure of your body's energy reserves, charged by rest and sleep and drained by stress and activity. BetterGarmin's own live-curve estimate arrives in a later update."
          />
          <HeroRing
            metric="readiness"
            value={null}
            label="Readiness"
            title="Readiness"
            description="BetterGarmin's recovery/readiness score — combining sleep, resting heart rate, training load, and stress — is coming in a later update."
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Steps" value={summary?.steps ?? 0} goal={summary?.step_goal} />
        <StatCard label="Floors" value={summary?.floors_up ?? 0} suffix=" fl" />
        <StatCard label="Calories" value={summary?.calories_total ?? 0} />
        <StatCard label="Distance" value={summary?.distance ?? 0} decimals={1} suffix=" km" />
      </div>

      {sleep && (
        <Card>
          <div className="flex items-center justify-between">
            <p className="font-semibold">Last night</p>
            <span className="text-sm text-[var(--text-secondary)]">{formatHoursMinutes(hmsToMinutes(sleep.total_sleep))}</span>
          </div>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-[var(--ring-track)]">
            <SleepStageBar minutes={hmsToMinutes(sleep.deep_sleep)} total={hmsToMinutes(sleep.total_sleep)} color="#6d5bd0" />
            <SleepStageBar minutes={hmsToMinutes(sleep.rem_sleep)} total={hmsToMinutes(sleep.total_sleep)} color="#8b7bf6" />
            <SleepStageBar minutes={hmsToMinutes(sleep.light_sleep)} total={hmsToMinutes(sleep.total_sleep)} color="#c2b6ff" />
            <SleepStageBar minutes={hmsToMinutes(sleep.awake)} total={hmsToMinutes(sleep.total_sleep)} color="#3a3d4a" />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-[var(--text-tertiary)]">
            <LegendDot color="#6d5bd0" label="Deep" />
            <LegendDot color="#8b7bf6" label="REM" />
            <LegendDot color="#c2b6ff" label="Light" />
            <LegendDot color="#3a3d4a" label="Awake" />
          </div>
        </Card>
      )}

      {insights.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <SparkleIcon width={16} height={16} className="text-sky-400" />
            <p className="font-semibold">Today's insights</p>
          </div>
          <ul className="flex flex-col gap-2.5">
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
    </div>
  )
}

function HeroRing({
  metric,
  value,
  label,
  title,
  description,
}: {
  metric: 'sleep' | 'stress' | 'energy' | 'readiness'
  value: number | null
  label: string
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Ring value={value} metric={metric} size={92} strokeWidth={8} />
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
        <InfoButton title={title}>{description}</InfoButton>
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

function SleepStageBar({ minutes, total, color }: { minutes: number | null; total: number | null; color: string }) {
  const pct = minutes && total ? (minutes / total) * 100 : 0
  return <div style={{ width: `${pct}%`, backgroundColor: color }} />
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
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
