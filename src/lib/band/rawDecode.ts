import { Decoder, Stream } from '@garmin/fitsdk'
import { decodeMessage, type ProtoField } from './proto'
import { fitStart } from './wellness'

/**
 * Raw views of band files nobody has documented, so their numbers can be matched against what Garmin Connect shows
 * for the same day. These contain health values: shown only when the user asks, never logged or uploaded.
 */

const FIT_EPOCH_S = 631065600
const pad = (n: number) => String(n).padStart(2, '0')
const local = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** A number that looks like a Garmin timestamp (FIT epoch or Unix seconds in 2020–2035) gets a readable date beside it. */
function annotate(n: number): string {
  if (n > 946_684_800 && n < 1_400_000_000) return `${n} (FIT time? ${local((n + FIT_EPOCH_S) * 1000)})`
  if (n > 1_577_836_800 && n < 2_051_222_400) return `${n} (Unix time? ${local(n * 1000)})`
  return String(n)
}

const printable = (b: Uint8Array) => b.length > 0 && b.every((c) => c >= 0x20 && c < 0x7f)

/** Protobuf as an indented tree of field numbers; nested messages are expanded where they parse cleanly. */
export function protoTree(bytes: Uint8Array, depth = 0): string[] {
  const fields = decodeMessage(bytes)
  if (!fields) return [`${'  '.repeat(depth)}(not protobuf) ${hexShort(bytes)}`]
  return fields.flatMap((f: ProtoField) => {
    const ind = '  '.repeat(depth)
    if ((f.wire === 5 || f.wire === 1) && f.value instanceof Uint8Array) {
      const dv = new DataView(f.value.slice().buffer)
      const int = f.wire === 5 ? dv.getUint32(0, true) : Number(dv.getBigUint64(0, true))
      const asFloat = f.wire === 5 ? dv.getFloat32(0, true) : dv.getFloat64(0, true)
      return [`${ind}${f.field}: ${annotate(int)} (fixed${f.wire === 5 ? 32 : 64}; as decimal ${Number.isFinite(asFloat) ? +asFloat.toPrecision(6) : '—'})`]
    }
    if (f.value instanceof Uint8Array) {
      if (printable(f.value)) return [`${ind}${f.field}: "${new TextDecoder().decode(f.value)}"`]
      const nested = f.value.length > 1 && depth < 6 ? decodeMessage(f.value) : null
      if (nested && nested.length) return [`${ind}${f.field}: {`, ...protoTree(f.value, depth + 1), `${ind}}`]
      return [`${ind}${f.field}: bytes ${hexShort(f.value)}`]
    }
    return [`${ind}${f.field}: ${typeof f.value === 'number' ? annotate(f.value) : String(f.value)}`]
  })
}

const hexShort = (b: Uint8Array) => Array.from(b.slice(0, 24), (x) => x.toString(16).padStart(2, '0')).join(' ') + (b.length > 24 ? ` … (${b.length} bytes)` : '')

function fmtValue(v: unknown): string {
  if (v instanceof Date) return local(v.getTime())
  if (Array.isArray(v)) return `[${v.map(fmtValue).join(', ')}]`
  if (typeof v === 'number') return annotate(v)
  return String(v)
}

/** Every FIT message in file order, with documented field names where known and field numbers otherwise. */
export function fitDump(raw: Uint8Array, maxPerType = 30): string[] {
  const start = fitStart(raw)
  if (start < 0) return ['(no FIT header)']
  const stream = Stream.fromByteArray(Array.from(start ? raw.slice(start) : raw))
  const decoder = new Decoder(stream)
  const seen: Record<number, number> = {}
  const out: string[] = []
  decoder.read({
    includeUnknownData: true,
    mergeHeartRates: false,
    mesgListener: ((num: number, m: Record<string, unknown>) => {
      seen[num] = (seen[num] ?? 0) + 1
      if (seen[num] > maxPerType) return
      const parts = Object.entries(m).map(([k, v]) => `${k}=${fmtValue(v)}`)
      out.push(`[${num}] ${parts.join('  ')}`)
    }) as never,
  })
  for (const [n, c] of Object.entries(seen)) if (c > maxPerType) out.push(`[${n}] … ${c - maxPerType} more not shown`)
  return out
}

/** Best raw view for a band file. */
export function rawView(bytes: Uint8Array): string {
  return (fitStart(bytes) >= 0 ? fitDump(bytes) : protoTree(bytes)).join('\n')
}
