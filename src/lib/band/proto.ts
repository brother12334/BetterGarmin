/**
 * Minimal protobuf wire-format codec. The band's message schemas aren't published, so messages are built from
 * field numbers and decoded into a generic field tree.
 */

export type ProtoValue = number | bigint | Uint8Array

export interface ProtoField {
  field: number
  wire: 0 | 1 | 2 | 5
  value: ProtoValue
}

export function varint(v: number | bigint): number[] {
  let n = BigInt(v)
  const out: number[] = []
  do {
    let b = Number(n & 0x7fn)
    n >>= 7n
    if (n > 0n) b |= 0x80
    out.push(b)
  } while (n > 0n)
  return out
}

export const tag = (field: number, wire: number) => varint((field << 3) | wire)

/** A varint field. */
export function vfield(field: number, v: number | bigint): number[] {
  return [...tag(field, 0), ...varint(v)]
}

/** A length-delimited field (embedded message, bytes or string). */
export function lfield(field: number, body: number[] | Uint8Array): number[] {
  return [...tag(field, 2), ...varint(body.length), ...body]
}

export function decodeMessage(bytes: Uint8Array): ProtoField[] | null {
  const out: ProtoField[] = []
  let i = 0
  const readVarint = (): bigint | null => {
    let shift = 0n
    let result = 0n
    while (i < bytes.length) {
      const b = bytes[i++]
      result |= BigInt(b & 0x7f) << shift
      if (!(b & 0x80)) return result
      shift += 7n
      if (shift > 63n) return null
    }
    return null
  }
  while (i < bytes.length) {
    const key = readVarint()
    if (key == null) return null
    const field = Number(key >> 3n)
    const wire = Number(key & 7n)
    if (field === 0) return null
    if (wire === 0) {
      const v = readVarint()
      if (v == null) return null
      out.push({ field, wire: 0, value: v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v })
    } else if (wire === 2) {
      const len = readVarint()
      if (len == null || i + Number(len) > bytes.length) return null
      out.push({ field, wire: 2, value: bytes.slice(i, i + Number(len)) })
      i += Number(len)
    } else if (wire === 5) {
      if (i + 4 > bytes.length) return null
      out.push({ field, wire: 5, value: bytes.slice(i, i + 4) })
      i += 4
    } else if (wire === 1) {
      if (i + 8 > bytes.length) return null
      out.push({ field, wire: 1, value: bytes.slice(i, i + 8) })
      i += 8
    } else {
      return null
    }
  }
  return out
}

/** The first embedded message at `field`, decoded, or null. */
export function sub(fields: ProtoField[] | null, field: number): ProtoField[] | null {
  const f = fields?.find((x) => x.field === field && x.wire === 2)
  return f ? decodeMessage(f.value as Uint8Array) : null
}

export function num(fields: ProtoField[] | null, field: number): number | null {
  const f = fields?.find((x) => x.field === field && x.wire === 0)
  return f == null ? null : Number(f.value)
}

/** Readable dump of a decoded message, recursing into length-delimited fields that parse as messages. */
export function describe(fields: ProtoField[] | null, depth = 0): unknown {
  if (!fields) return null
  return fields.map((f) => {
    if (f.wire === 2) {
      const bytes = f.value as Uint8Array
      const nested = depth < 8 && bytes.length > 0 ? decodeMessage(bytes) : null
      const text = printable(bytes)
      return { [f.field]: nested && !text ? describe(nested, depth + 1) : text ?? `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}` }
    }
    return { [f.field]: f.value instanceof Uint8Array ? Array.from(f.value) : typeof f.value === 'bigint' ? f.value.toString() : f.value }
  })
}

function printable(bytes: Uint8Array): string | null {
  if (bytes.length < 2) return null
  for (const b of bytes) if (b < 0x20 || b > 0x7e) return null
  return new TextDecoder().decode(bytes)
}

/** Depth-first search for every embedded message reachable at a field-number path pattern. */
export function findAll(fields: ProtoField[] | null, predicate: (f: ProtoField, path: number[]) => boolean, path: number[] = [], depth = 0): { field: ProtoField; path: number[] }[] {
  const hits: { field: ProtoField; path: number[] }[] = []
  if (!fields || depth > 10) return hits
  for (const f of fields) {
    const p = [...path, f.field]
    if (predicate(f, p)) hits.push({ field: f, path: p })
    if (f.wire === 2) hits.push(...findAll(decodeMessage(f.value as Uint8Array), predicate, p, depth + 1))
  }
  return hits
}
