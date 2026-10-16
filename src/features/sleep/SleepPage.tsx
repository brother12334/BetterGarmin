import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Chart } from '../../components/ui/Chart'
import { InfoButton } from '../../components/ui/InfoButton'
import { Skeleton } from '../../components/ui/Skeleton'
import { useData } from '../../app/DataProvider'
import { getLatestDay, getSleepEventsForDay, getSleepRange } from '../../db/queries'
import type { SleepEventRow, SleepRow } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { hmsToMinutes, formatHoursMinutes } from '../../lib/duration'
import { statusForScore, STATUS_COLORS } from '../../lib/statusWords'
import { parseSleepTimestamp } from '../training/matchGarminActivity'

const HISTORY_DAYS = 21
const SLEEP_TARGET_MIN = 480 // 8h

const STAGE_COLORS: Record<string, string> = {
  deep_sleep: '#6d5bd0',
  rem_sleep: '#8b7bf6',
  light_sleep: '#c2b6ff',
  awake: '#3a3d4a',
  wake_time: '#3a3d4a',
}
const STAGE_LABELS: Record<string, string> = {
  deep_sleep: 'Deep',
  rem_sleep: 'REM',
  light_sleep: 'Light',
  awake: 'Awake',
  wake_time: 'Awake',
}

interface SleepData {
  day: string
  latest: SleepRow | null
  events: SleepEventRow[]
  history: SleepRow[]
}

export function SleepPage() {
  const { loadedKinds, lastSynced } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const [data, setData] = useState<SleepData | null>(null)
  const [loading, setLoading] = useState(true)

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
      const startDay = addDays(day, -HISTORY_DAYS)
      const [latest, events, history] = await Promise.all([
        getSleepRange(day, day).then((r) => r[0] ?? null),
        getSleepEventsForDay(addDays(day, -1)),
        getSleepRange(startDay, day),
      ])
      if (!cancelled) {
        setData({ day, latest, events, history })
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasGarmin, lastSynced])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    )
  }

  if (!data || !data.latest) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Sleep</h1>
        <Card className="text-center text-[var(--text-secondary)]">No sleep data loaded yet.</Card>
      </div>
    )
  }

  const { latest, events, history } = data
  const sleepScoreStatus = statusForScore(latest.score, [50, 70, 85])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Sleep</h1>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Last night</p>
            <p className="text-xs text-[var(--text-tertiary)]">{formatHoursMinutes(hmsToMinutes(latest.total_sleep))} total</p>
          </div>
          <div className="text-right">
            <p
              className="text-3xl font-bold tabular-nums"
              style={{ color: sleepScoreStatus ? STATUS_COLORS[sleepScoreStatus] : 'var(--text-primary)' }}
            >
              {latest.score ?? '—'}
            </p>
            <p className="text-xs capitalize text-[var(--text-tertiary)]">{latest.qualifier ?? ''}</p>
          </div>
        </div>
        {events.length > 0 && <Hypnogram events={events} />}
        <SleepBreakdown sleep={latest} />
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-1.5">
          <p className="font-semibold">Bedtime &amp; wake consistency</p>
          <InfoButton title="Consistency">
            Going to bed and waking up around the same time each day helps your circadian rhythm — and your sleep
            score.
          </InfoButton>
        </div>
        <ConsistencyChart history={history} />
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-1.5">
          <p className="font-semibold">Sleep debt</p>
          <InfoButton title="Sleep debt">
            {`Cumulative shortfall against an 8-hour target over the last ${HISTORY_DAYS} nights. Rising means you've been under-sleeping; falling means you've been catching up.`}
          </InfoButton>
        </div>
        <SleepDebtChart history={history} />
      </Card>
    </div>
  )
}

function Hypnogram({ events }: { events: SleepEventRow[] }) {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const toMs = (ts: string) => parseSleepTimestamp(ts) ?? NaN
  const start = toMs(sorted[0].timestamp)
  const end = sorted.reduce((max, e) => Math.max(max, toMs(e.timestamp) + hmsToMinutes(e.duration)! * 60000), start)
  const totalMs = Math.max(1, end - start)

  return (
    <div className="mt-4">
      <div className="relative h-8 w-full overflow-hidden rounded-lg bg-[var(--ring-track)]">
        {sorted.map((event, i) => {
          const eventStart = toMs(event.timestamp)
          const durationMs = (hmsToMinutes(event.duration) ?? 0) * 60000
          const left = ((eventStart - start) / totalMs) * 100
          const width = (durationMs / totalMs) * 100
          return (
            <div
              key={i}
              className="absolute top-0 h-full"
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: STAGE_COLORS[event.event] ?? '#555' }}
              title={`${STAGE_LABELS[event.event] ?? event.event} · ${Math.round(durationMs / 60000)}m`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-[var(--text-tertiary)]">
        {(['deep_sleep', 'rem_sleep', 'light_sleep', 'awake'] as const).map((stage) => (
          <span key={stage} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
            {STAGE_LABELS[stage]}
          </span>
        ))}
      </div>
    </div>
  )
}

function SleepBreakdown({ sleep }: { sleep: SleepRow }) {
  const total = hmsToMinutes(sleep.total_sleep) ?? 0
  const deep = hmsToMinutes(sleep.deep_sleep) ?? 0
  const rem = hmsToMinutes(sleep.rem_sleep) ?? 0
  const durationNote =
    total >= 420 && total <= 540
      ? 'Duration was in a solid range.'
      : total < 420
        ? 'Duration was on the short side.'
        : 'Duration was longer than typical.'
  const deepPct = total > 0 ? (deep / total) * 100 : 0
  const remPct = total > 0 ? (rem / total) * 100 : 0
  const stageNote =
    deepPct >= 13 && remPct >= 18
      ? 'Deep and REM proportions both look healthy.'
      : deepPct < 13
        ? 'Deep sleep was a smaller share than usual — often tied to late nights or alcohol/caffeine.'
        : 'REM sleep was a smaller share than usual.'

  return (
    <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--border-panel)] pt-3 text-sm text-[var(--text-secondary)]">
      <li>• {durationNote}</li>
      <li>• {stageNote}</li>
      {sleep.avg_stress != null && (
        <li>• Overnight stress averaged {Math.round(sleep.avg_stress)}, {sleep.avg_stress < 25 ? 'nice and calm' : 'a bit elevated'}.</li>
      )}
    </ul>
  )
}

function hourValue(iso: string, wraparound: boolean): number {
  const d = new Date(parseSleepTimestamp(iso) ?? NaN)
  let h = d.getHours() + d.getMinutes() / 60
  if (wraparound && h < 12) h += 24
  return h
}

function formatHourAxis(h: number): string {
  const normalized = ((h % 24) + 24) % 24
  const hour = Math.floor(normalized)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}${ampm}`
}

function ConsistencyChart({ history }: { history: SleepRow[] }) {
  const bedtimes = history.filter((h) => h.start).map((h) => [`${h.day}T00:00:00`, hourValue(h.start as string, true)])
  const waketimes = history.filter((h) => h.end).map((h) => [`${h.day}T00:00:00`, hourValue(h.end as string, false)])

  return (
    <Chart
      option={{
        xAxis: {
          type: 'time',
          splitNumber: 4,
          axisLine: { lineStyle: { color: 'var(--border-panel)' } },
          axisLabel: { color: 'var(--text-tertiary)', hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) },
        },
        yAxis: {
          type: 'value',
          min: 18,
          max: 32,
          splitLine: { lineStyle: { color: 'var(--border-panel)' } },
          axisLabel: { color: 'var(--text-tertiary)', formatter: (v: number) => formatHourAxis(v) },
        },
        legend: { data: ['Bedtime', 'Wake'], textStyle: { color: 'var(--text-tertiary)' }, top: 0 },
        series: [
          { name: 'Bedtime', type: 'scatter', data: bedtimes, symbolSize: 7, itemStyle: { color: '#8b7bf6' } },
          { name: 'Wake', type: 'scatter', data: waketimes, symbolSize: 7, itemStyle: { color: '#f5a623' } },
        ],
      }}
    />
  )
}

function SleepDebtChart({ history }: { history: SleepRow[] }) {
  const points: (string | number)[][] = []
  history.reduce((cumulative, h) => {
    const minutes = hmsToMinutes(h.total_sleep) ?? SLEEP_TARGET_MIN
    const next = cumulative + (SLEEP_TARGET_MIN - minutes)
    points.push([`${h.day}T00:00:00`, Math.round((next / 60) * 10) / 10])
    return next
  }, 0)

  return (
    <Chart
      option={{
        xAxis: {
          type: 'time',
          splitNumber: 4,
          axisLine: { lineStyle: { color: 'var(--border-panel)' } },
          axisLabel: { color: 'var(--text-tertiary)', hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: 'var(--border-panel)' } },
          axisLabel: { color: 'var(--text-tertiary)', formatter: '{value}h' },
        },
        series: [
          {
            type: 'line',
            data: points,
            smooth: true,
            symbol: 'none',
            lineStyle: { color: '#f5a623', width: 2 },
            areaStyle: { color: 'rgba(245, 166, 35, 0.12)' },
          },
        ],
      }}
    />
  )
}
