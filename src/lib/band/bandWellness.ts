import { sqliteClient } from '../../db/client'
import type { BandFileStore } from './bandFileStore'
import { decodeWellnessDetailed, hasWellness, mergeWellness, type WellnessData } from './wellness'
import { nights, wellnessOverlays } from './wellnessSql'

export interface WellnessSummary {
  files: number
  stress: number
  bodyBattery: number
  hr: number
  nights: number
  /** FIT message counts by number across all files (no values), for the protocol log. */
  counts: Record<string, number>
  /** One line per stored file: type, size, first header bytes and what decoding found. No health values. */
  diagnostics: string[]
}

/** Decodes every stored band file that isn't an activity and feeds its all-day data to the dashboard. */
export async function applyBandWellness(store: BandFileStore): Promise<WellnessSummary | null> {
  const records = await store.all()
  const parts: WellnessData[] = []
  const diagnostics: string[] = []
  for (const r of records) {
    const head = Array.from(r.bytes.slice(0, 14), (b) => b.toString(16).padStart(2, '0')).join(' ')
    const base = `${r.dataType ?? '?'} ${r.fileType ?? r.status} ${r.size}B [${head}]`
    if (r.activity) {
      diagnostics.push(`${base}: activity`)
      continue
    }
    const d = decodeWellnessDetailed(r.bytes)
    if (!d.ok) {
      diagnostics.push(`${base}: ${d.reason}`)
      continue
    }
    diagnostics.push(`${base}: ${d.offset ? `FIT at +${d.offset}, ` : ''}messages ${JSON.stringify(d.data.counts)}`)
    if (hasWellness(d.data)) parts.push(d.data)
  }
  if (!parts.length) return { files: 0, stress: 0, bodyBattery: 0, hr: 0, nights: 0, counts: {}, diagnostics }
  const w = mergeWellness(parts)
  const { garmin, monitoring } = wellnessOverlays(w)
  await sqliteClient.overlay('garmin', garmin.schema, garmin.statements)
  await sqliteClient.overlay('monitoring', monitoring.schema, monitoring.statements)
  return { files: parts.length, stress: w.stress.length, bodyBattery: w.bodyBattery.length, hr: w.hr.length, nights: nights(w).length, counts: w.counts, diagnostics }
}
