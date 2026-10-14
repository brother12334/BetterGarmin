import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Card } from '../../components/ui/Card'
import { Chart } from '../../components/ui/Chart'
import { Skeleton } from '../../components/ui/Skeleton'
import { useData } from '../../app/DataProvider'
import { useUnits } from '../../app/units'
import { formatDistance, formatElevation, formatSpeed } from '../../lib/units'
import { getActivity, getActivityLaps, getActivityRecords, getStepsActivityVo2Max } from '../../db/queries'
import type { ActivityLapRow, ActivityRecordRow, ActivityRow } from '../../db/types'
import { formatHoursMinutes, hmsToMinutes } from '../../lib/duration'

interface DetailData {
  activity: ActivityRow
  laps: ActivityLapRow[]
  records: ActivityRecordRow[]
  vo2Max: number | null
}

// Standard OSM tiles, no API key required. Inverted via CSS filter on the tile pane for a dark look.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function ActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>()
  const { loadedKinds } = useData()
  const { units } = useUnits()
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<L.Map | null>(null)
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!activityId || !loadedKinds.includes('activities')) {
        if (!cancelled) setLoading(false)
        return
      }
      setLoading(true)
      const [activity, laps, records] = await Promise.all([
        getActivity(activityId),
        getActivityLaps(activityId),
        getActivityRecords(activityId),
      ])
      if (!activity) {
        if (!cancelled) {
          setData(null)
          setLoading(false)
        }
        return
      }
      const vo2Max = await getStepsActivityVo2Max(activityId)
      if (!cancelled) {
        setData({ activity, laps, records, vo2Max })
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [activityId, loadedKinds])

  const routePoints = useMemo(() => {
    if (!data) return []
    return data.records
      .filter((r) => r.position_lat != null && r.position_long != null)
      .map((r) => [r.position_lat as number, r.position_long as number] as [number, number])
  }, [data])

  // Set up the Leaflet map once route points are available.
  useEffect(() => {
    if (!mapRef.current || routePoints.length === 0 || leafletMapRef.current) return
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true })
    map.getPane('tilePane')!.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)'
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    const polyline = L.polyline(routePoints, { color: '#38bdf8', weight: 3.5, opacity: 0.9 }).addTo(map)
    map.fitBounds(polyline.getBounds(), { padding: [24, 24] })
    L.circleMarker(routePoints[0], { radius: 6, color: '#34d399', fillColor: '#34d399', fillOpacity: 1 }).addTo(map)
    L.circleMarker(routePoints[routePoints.length - 1], { radius: 6, color: '#fb4a59', fillColor: '#fb4a59', fillOpacity: 1 }).addTo(map)
    leafletMapRef.current = map
    return () => {
      map.remove()
      leafletMapRef.current = null
    }
  }, [routePoints])

  // Sync chart hover -> map marker.
  useEffect(() => {
    const map = leafletMapRef.current
    if (!map || !data) return
    if (hoverIndex == null) {
      hoverMarkerRef.current?.remove()
      hoverMarkerRef.current = null
      return
    }
    const record = data.records[hoverIndex]
    if (!record || record.position_lat == null || record.position_long == null) return
    const pos: [number, number] = [record.position_lat, record.position_long]
    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.setLatLng(pos)
    } else {
      hoverMarkerRef.current = L.circleMarker(pos, {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 1,
      }).addTo(map)
    }
  }, [hoverIndex, data])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <Link to="/training" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          ← Back to Training
        </Link>
        <Card className="text-center text-[var(--text-secondary)]">Activity not found.</Card>
      </div>
    )
  }

  const { activity, laps, records, vo2Max } = data
  const isStrength = activity.sub_sport === 'strength_training' || activity.sport === 'strength_training'
  const hrSeries = records.filter((r) => r.hr != null).map((r, i) => ({ i, hr: r.hr as number }))
  const elevationSeries = records.filter((r) => r.altitude != null).map((r, i) => ({ i, altitude: r.altitude as number }))

  return (
    <div className="flex flex-col gap-6">
      <Link to="/training" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        ← Back to Training
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{activity.name || activity.sport || 'Activity'}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {activity.start_time && new Date(activity.start_time.replace(' ', 'T')).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        </div>
        {isStrength && (
          <Link to="/training/strength" className="shrink-0 text-sm text-violet-300 hover:text-violet-200">
            View sets →
          </Link>
        )}
      </div>

      {routePoints.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div ref={mapRef} style={{ height: 280, width: '100%' }} />
        </Card>
      )}

      {isStrength ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Duration" value={formatHoursMinutes(hmsToMinutes(activity.elapsed_time))} />
          <Stat label="Avg HR" value={activity.avg_hr != null ? `${activity.avg_hr} bpm` : '—'} />
          <Stat label="Max HR" value={activity.max_hr != null ? `${activity.max_hr} bpm` : '—'} />
          <Stat label="Calories" value={activity.calories != null ? `${activity.calories}` : '—'} />
          <Stat label="Training load" value={activity.training_load != null ? activity.training_load.toFixed(1) : '—'} />
          <Stat label="Avg breaths/min" value={activity.avg_rr != null ? activity.avg_rr.toFixed(0) : '—'} />
          <Stat label="Effort" value={activity.self_eval_effort != null ? `${activity.self_eval_effort}/5` : '—'} />
          <Stat label="Feel" value={activity.self_eval_feel != null ? `${activity.self_eval_feel}/5` : '—'} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Distance" value={formatDistance(activity.distance, units, 2)} />
          <Stat label="Duration" value={formatHoursMinutes(hmsToMinutes(activity.elapsed_time))} />
          <Stat label="Avg HR" value={activity.avg_hr != null ? `${activity.avg_hr} bpm` : '—'} />
          <Stat label="Max HR" value={activity.max_hr != null ? `${activity.max_hr} bpm` : '—'} />
          <Stat label="Calories" value={activity.calories != null ? `${activity.calories}` : '—'} />
          <Stat label="Elevation gain" value={formatElevation(activity.ascent, units)} />
          <Stat label="Training load" value={activity.training_load != null ? activity.training_load.toFixed(1) : '—'} />
          <Stat label="VO2max" value={vo2Max != null ? vo2Max.toFixed(1) : '—'} />
        </div>
      )}

      {hrSeries.length > 1 && (
        <Card>
          <p className="mb-2 font-semibold">Heart rate</p>
          <Chart
            option={{
              xAxis: { type: 'category', show: false, data: hrSeries.map((p) => p.i) },
              yAxis: { type: 'value', splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
              series: [{ type: 'line', data: hrSeries.map((p) => p.hr), symbol: 'none', lineStyle: { color: '#fb4a59', width: 1.5 } }],
            }}
            height={160}
            onHover={setHoverIndex}
          />
        </Card>
      )}

      {elevationSeries.length > 1 && (
        <Card>
          <p className="mb-2 font-semibold">Elevation</p>
          <Chart
            option={{
              xAxis: { type: 'category', show: false, data: elevationSeries.map((p) => p.i) },
              yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
              series: [
                {
                  type: 'line',
                  data: elevationSeries.map((p) => p.altitude),
                  symbol: 'none',
                  lineStyle: { color: '#34d399', width: 1.5 },
                  areaStyle: { color: 'rgba(52, 211, 153, 0.1)' },
                },
              ],
            }}
            height={140}
            onHover={setHoverIndex}
          />
        </Card>
      )}

      {laps.length > 0 && (
        <Card className="overflow-x-auto">
          <p className="mb-2 font-semibold">Laps</p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-tertiary)]">
                <th className="py-1.5 pr-3 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">Distance</th>
                <th className="py-1.5 pr-3 font-medium">Time</th>
                <th className="py-1.5 pr-3 font-medium">Avg HR</th>
                <th className="py-1.5 font-medium">Pace</th>
              </tr>
            </thead>
            <tbody>
              {laps.map((lap) => (
                <tr key={lap.lap} className="border-t border-[var(--border-panel)]">
                  <td className="py-1.5 pr-3">{lap.lap}</td>
                  <td className="py-1.5 pr-3">{formatDistance(lap.distance, units, 2)}</td>
                  <td className="py-1.5 pr-3">{formatHoursMinutes(hmsToMinutes(lap.elapsed_time))}</td>
                  <td className="py-1.5 pr-3">{lap.avg_hr ?? '—'}</td>
                  <td className="py-1.5">{formatSpeed(lap.avg_speed, units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </Card>
  )
}
