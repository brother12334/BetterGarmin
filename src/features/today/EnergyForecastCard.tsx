import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { InfoButton } from '../../components/ui/InfoButton'
import { Chart } from '../../components/ui/Chart'
import { METRIC_COLORS } from '../../components/ui/metricColors'
import { useData } from '../../app/DataProvider'
import { getBandEnergySince } from '../../db/queries'
import { formatHour } from '../../lib/clock'
import { forecastEnergy, MIN_DAYS, type EnergyForecast } from './energyForecast'

/** How far back to look for comparable days. */
const HISTORY_DAYS = 60

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Energy for the rest of today, from how your energy changed after this hour on your own past days. */
export function EnergyForecastCard({ day }: { day: string }) {
  const { lastSynced } = useData()
  const [forecast, setForecast] = useState<EnergyForecast | null>(null)

  useEffect(() => {
    let cancelled = false
    const since = new Date(`${day}T00:00:00`)
    since.setDate(since.getDate() - HISTORY_DAYS)
    getBandEnergySince(isoDay(since)).then((samples) => {
      if (!cancelled) setForecast(forecastEnergy(samples, day))
    })
    return () => {
      cancelled = true
    }
  }, [day, lastSynced])

  if (!forecast) return null
  const at = (hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:59:00`).getTime()
  const { points, now } = forecast
  const color = METRIC_COLORS.energy.solid
  const evening = points.find((p) => p.hour === 18) ?? points[points.length - 1]

  const option = {
    grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
    xAxis: {
      type: 'time' as const,
      min: at(now.hour),
      max: at(23),
      splitNumber: 4,
      axisLine: { lineStyle: { color: 'var(--border-panel)' } },
      axisLabel: { color: 'var(--text-tertiary)', formatter: formatHour, hideOverlap: true },
    },
    yAxis: { type: 'value' as const, min: 0, max: 100, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
    series: [
      // The range is drawn as an invisible floor (low) with the band (high − low) stacked on top of it.
      { type: 'line' as const, stack: 'range', symbol: 'none', lineStyle: { opacity: 0 }, data: points.map((p) => [at(p.hour), p.low]) },
      {
        type: 'line' as const,
        stack: 'range',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: 0.2 },
        data: points.map((p) => [at(p.hour), p.high - p.low]),
      },
      {
        type: 'line' as const,
        symbol: 'none',
        lineStyle: { color, width: 2 },
        data: [[at(now.hour), now.value], ...points.map((p) => [at(p.hour), p.mid])],
      },
    ],
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <p className="font-semibold">Energy forecast</p>
        <InfoButton title="Energy forecast">
          {`Where your energy (the band's Body Battery) is likely to be for the rest of today. For every past day with a reading at this hour, BetterGarmin looks at how much your energy went up or down from this hour to each later hour, and adds that to where you are now. The line is the typical (median) day; the shaded band covers the middle half of your days. It can't know what you'll do today, so a hard workout or a nap will move it. An hour is only shown once at least ${MIN_DAYS} past days have readings for it.`}
        </InfoButton>
      </div>
      {points.length ? (
        <>
          <p className="mb-2 text-sm text-[var(--text-secondary)]">
            Now {now.value}. Around {formatHour(at(evening.hour))}: likely {evening.mid} (between {evening.low} and {evening.high}), based on{' '}
            {evening.days} of your days.
          </p>
          <Chart option={option} height={180} />
        </>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">
          Now {now.value}. A forecast needs at least {MIN_DAYS} past days of band energy readings at this time of day (so far:{' '}
          {forecast.daysUsed}). It fills in as the band syncs.
        </p>
      )}
    </Card>
  )
}
