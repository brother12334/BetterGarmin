import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useData } from '../../app/DataProvider'
import { getActivitiesRange, getDailySummaryRange, getLatestActivityDay, getLatestDay, getSleepRange } from '../../db/queries'
import { addDays } from '../../lib/dateRange'
import { downloadObjectsAsCsv } from '../../lib/csv'

const FULL_HISTORY_DAYS = 3650

export function QuickExport() {
  const { loadedKinds } = useData()
  const hasGarmin = loadedKinds.includes('garmin')
  const hasActivities = loadedKinds.includes('activities')
  const [busy, setBusy] = useState<string | null>(null)

  async function exportDailySummary() {
    setBusy('daily')
    try {
      const latest = await getLatestDay()
      if (!latest) return
      const rows = await getDailySummaryRange(addDays(latest, -FULL_HISTORY_DAYS), latest)
      downloadObjectsAsCsv('bettergarmin-daily-summary', rows)
    } finally {
      setBusy(null)
    }
  }

  async function exportSleep() {
    setBusy('sleep')
    try {
      const latest = await getLatestDay()
      if (!latest) return
      const rows = await getSleepRange(addDays(latest, -FULL_HISTORY_DAYS), latest)
      downloadObjectsAsCsv('bettergarmin-sleep', rows)
    } finally {
      setBusy(null)
    }
  }

  async function exportActivities() {
    setBusy('activities')
    try {
      const latest = await getLatestActivityDay()
      if (!latest) return
      const rows = await getActivitiesRange(addDays(latest, -FULL_HISTORY_DAYS), latest)
      downloadObjectsAsCsv('bettergarmin-activities', rows)
    } finally {
      setBusy(null)
    }
  }

  if (!hasGarmin && !hasActivities) {
    return <p className="text-sm text-[var(--text-secondary)]">Load some data first to export it.</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {hasGarmin && (
        <Button loading={busy === 'daily'} variant="secondary" onClick={exportDailySummary} disabled={busy === 'daily'}>
          {busy === 'daily' ? 'Exporting…' : 'Export daily summary'}
        </Button>
      )}
      {hasGarmin && (
        <Button loading={busy === 'sleep'} variant="secondary" onClick={exportSleep} disabled={busy === 'sleep'}>
          {busy === 'sleep' ? 'Exporting…' : 'Export sleep'}
        </Button>
      )}
      {hasActivities && (
        <Button loading={busy === 'activities'} variant="secondary" onClick={exportActivities} disabled={busy === 'activities'}>
          {busy === 'activities' ? 'Exporting…' : 'Export activities'}
        </Button>
      )}
    </div>
  )
}
