import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { Button } from '../../components/ui/Button'
import { useData } from '../../app/DataProvider'
import { getActivitiesRange, getLatestActivityDay } from '../../db/queries'
import type { ActivityRow } from '../../db/types'
import { addDays } from '../../lib/dateRange'
import { hmsToMinutes } from '../../lib/duration'
import { TrainingIcon } from '../../app/icons'

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

  const records = useMemo(() => {
    if (!activities) return null
    const bySport = new Map<string, ActivityRow[]>()
    for (const a of activities) {
      if (!a.sport) continue
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
        <Card className="text-center text-[var(--text-secondary)]">No activities loaded yet.</Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Training</h1>

      {records && records.length > 0 && (
        <Card>
          <p className="mb-3 font-semibold">Personal records</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {records.map((r) => (
              <div key={r.sport} className="rounded-xl bg-[var(--bg-panel)] p-3">
                <p className="text-xs capitalize text-[var(--text-tertiary)]">{r.sport.replace(/_/g, ' ')}</p>
                <p className="mt-1 text-sm font-semibold">
                  {r.longestDistance?.distance != null ? `${r.longestDistance.distance.toFixed(1)} km longest` : `${r.count} activities`}
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
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                <TrainingIcon width={20} height={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{activity.name || activity.sport || 'Activity'}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {activity.start_time ? new Date(activity.start_time.replace(' ', 'T')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                  {' · '}
                  {formatDuration(activity.elapsed_time)}
                  {activity.distance != null ? ` · ${activity.distance.toFixed(1)} km` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {activity.avg_hr != null && <p className="text-sm font-semibold">{activity.avg_hr} bpm</p>}
                {activity.calories != null && <p className="text-xs text-[var(--text-tertiary)]">{activity.calories} cal</p>}
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
