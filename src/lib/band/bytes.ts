/** Small byte helpers shared by the band protocol modules. */

export function hex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

export function fromHex(text: string): Uint8Array {
  const clean = text.replace(/[^0-9a-f]/gi, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
export const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
export const readU16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
export const readU32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000

/** Length-prefixed (1 byte) UTF-8 string, as used in GFDI device information. */
export function pstring(s: string): number[] {
  const b = new TextEncoder().encode(s)
  return [b.length, ...b]
}
