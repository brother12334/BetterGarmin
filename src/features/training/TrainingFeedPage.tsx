import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { Button } from '../../components/ui/Button'
import { useData } from '../../app/DataProvider'
import { useUnits } from '../../app/units'
import { formatDistance } from '../../lib/units'
import { getActivitiesRange, getLatestActivityDay } from '../../db/queries'
import type { ActivityRow } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { hmsToMinutes } from '../../lib/duration'
import { TrainingIcon } from '../../app/icons'
import { TrainingOverview } from './TrainingOverview'

const PAGE_DAYS = 90

function formatDuration(hms: string | null): string {
  const minutes = hmsToMinutes(hms)
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function TrainingFeedPage() {
  const { loadedKinds, lastSynced } = useData()
  const { units } = useUnits()
  const hasActivities = loadedKinds.includes('activities')
  const [activities, setActivities] = useState<ActivityRow[] | null>(null)
  const [windowDays, setWindowDays] = useState(PAGE_DAYS)
  const [latestDay, setLatestDay] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!hasActivities) {
        if (!cancelled) {
          setActivities(null)
          setLoading(false)
        }
        return
      }
      setLoading(true)
      const latest = await getLatestActivityDay()
      if (!latest) {
        if (!cancelled) {
          setActivities(null)
          setLoading(false)
        }
        return
      }
      const rows = await getActivitiesRange(addDays(latest, -windowDays), latest)
      if (!cancelled) {
        setLatestDay(latest)
        setActivities(rows)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [hasActivities, windowDays, lastSynced])

  const strengthCount = useMemo(
    () => activities?.filter((a) => a.sub_sport === 'strength_training' || a.sport === 'strength_training').length ?? 0,
    [activities],
  )

  // Strength (and Element 26 import) works without any Garmin activities, so it is always reachable.
  const strengthLink = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/training/history">
          <Card className="flex h-full flex-col gap-1">
            <p className="font-semibold">Workout history</p>
            <p className="text-xs text-[var(--text-tertiary)]">Band recordings, search, notes</p>
          </Card>
        </Link>
        <Link to="/training/routines">
          <Card className="flex h-full flex-col gap-1">
            <p className="font-semibold">Routines</p>
            <p className="text-xs text-[var(--text-tertiary)]">Plans, progress and PRs</p>
          </Card>
        </Link>
      </div>
      <Link to="/training/strength">
        <Card className="flex items-center gap-4 border-teal-500/30 transition-colors hover:border-teal-500/60">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-teal-500/15 text-teal-400">
            <TrainingIcon width={22} height={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Strength Training</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {strengthCount > 0 ? `${strengthCount} session${strengthCount === 1 ? '' : 's'} · PRs, volume, 1RM trends` : 'Log sets, track PRs and volume'}
            </p>
          </div>
          <span className="shrink-0 text-[var(--text-tertiary)]">→</span>
        </Card>
      </Link>
    </>
  )

  const records = useMemo(() => {
    if (!activities) return null
    const bySport = new Map<string, ActivityRow[]>()
    for (const a of activities) {
      if (!a.sport || a.sub_sport === 'strength_training' || a.sport === 'strength_training') continue
      const list = bySport.get(a.sport) ?? []
      list.push(a)
      bySport.set(a.sport, list)
    }
    return Array.from(bySport.entries()).map(([sport, list]) => {
      const longestDistance = list.reduce((best, a) => (a.distance != null && (best?.distance ?? 0) < a.distance ? a : best), null as ActivityRow | null)
      const longestDuration = list.reduce(
        (best, a) => ((hmsToMinutes(a.elapsed_time) ?? 0) > (hmsToMinutes(best?.elapsed_time ?? null) ?? 0) ? a : best),
        null as ActivityRow | null,
      )
      return { sport, longestDistance, longestDuration, count: list.length }
    })
  }, [activities])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (!activities) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Training</h1>
        {strengthLink}
        <Card className="text-center text-[var(--text-secondary)]">No activities loaded yet.</Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Training</h1>

      {strengthLink}
      {latestDay && <TrainingOverview activities={activities} latestDay={latestDay} />}

      {records && records.length > 0 && (
        <Card>
          <p className="mb-3 font-semibold">Personal records</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {records.map((r) => (
              <div key={r.sport} className="rounded-control bg-[var(--bg-panel)] p-3">
                <p className="text-xs capitalize text-[var(--text-tertiary)]">{r.sport.replace(/_/g, ' ')}</p>
                <p className="mt-1 text-sm font-semibold">
                  {r.longestDistance?.distance != null ? `${formatDistance(r.longestDistance.distance, units)} longest` : `${r.count} ${r.count === 1 ? 'activity' : 'activities'}`}
                </p>
                {r.longestDuration && (
                  <p className="text-xs text-[var(--text-tertiary)]">{formatDuration(r.longestDuration.elapsed_time)} longest</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {activities.map((activity) => (
          <Link key={activity.activity_id} to={`/training/${activity.activity_id}`}>
            <Card className="flex items-center gap-4 transition-colors hover:bg-white/5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-teal-500/10 text-teal-400">
                <TrainingIcon width={20} height={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{activity.name || activity.sport || 'Activity'}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {activity.start_time ? new Date(activity.start_time.replace(' ', 'T')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                  {' · '}
                  {formatDuration(activity.elapsed_time)}
                  {activity.distance != null ? ` · ${formatDistance(activity.distance, units)}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {activity.avg_hr != null && <p className="text-sm font-semibold">{activity.avg_hr} bpm</p>}
                {activity.sub_sport === 'strength_training' && activity.self_eval_effort != null ? (
                  <p className="text-xs text-[var(--text-tertiary)]">Effort {activity.self_eval_effort}/5</p>
                ) : (
                  activity.calories != null && <p className="text-xs text-[var(--text-tertiary)]">{activity.calories} cal</p>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {latestDay && windowDays < 450 && (
        <Button variant="secondary" onClick={() => setWindowDays((d) => d + PAGE_DAYS)} className="self-center">
          Load more
        </Button>
      )}
    </div>
  )
}
