import { sqliteClient } from '../../db/client'
import type { BandFileStore } from './bandFileStore'
import { decodeWellness, hasWellness, mergeWellness, type WellnessData } from './wellness'
import { nights, wellnessOverlays } from './wellnessSql'

export interface WellnessSummary {
  files: number
  stress: number
  bodyBattery: number
  hr: number
  nights: number
  /** FIT message counts by number across all files (no values), for the protocol log. */
  counts: Record<string, number>
}

/** Decodes every stored band file that isn't an activity and feeds its all-day data to the dashboard. */
export async function applyBandWellness(store: BandFileStore): Promise<WellnessSummary | null> {
  const records = await store.all()
  const parts: WellnessData[] = []
  for (const r of records) {
    if (r.activity) continue
    const w = decodeWellness(r.bytes)
    if (w && hasWellness(w)) parts.push(w)
  }
  if (!parts.length) return null
  const w = mergeWellness(parts)
  const { garmin, monitoring } = wellnessOverlays(w)
  await sqliteClient.overlay('garmin', garmin.schema, garmin.statements)
  await sqliteClient.overlay('monitoring', monitoring.schema, monitoring.statements)
  return { files: parts.length, stress: w.stress.length, bodyBattery: w.bodyBattery.length, hr: w.hr.length, nights: nights(w).length, counts: w.counts }
}
