import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hex } from './bytes'
import { ReliableChannel, decodeReliable, encodeReliable, seqDistance, sequenceCount } from './reliable'

describe('reliable header codec (native oracle vectors, CIRQA-Sync-Protocol)', () => {
  const payload = Uint8Array.of(0, 1, 254, 255)
  it.each([
    [128, 0, 0, '80 00 00 01 fe ff'],
    [128, 1, 0, '80 01 00 01 fe ff'],
    [128, 0, 1, '80 40 00 01 fe ff'],
    [128, 63, 63, '8f ff 00 01 fe ff'],
  ])('handle %i seq %i ack %i', (h, s, a, expected) => expect(hex(encodeReliable(h, s, a, payload))).toBe(expected))

  it('ACK-only for handle 0x82, next expected 7', () => expect(hex(encodeReliable(0x82, 0, 7))).toBe('a1 c0'))

  it('round-trips all 32,768 handle/ACK/sequence combinations', () => {
    let n = 0
    for (let h = 128; h <= 135; h++)
      for (let a = 0; a < 64; a++)
        for (let s = 0; s < 64; s++) {
          const p = decodeReliable(encodeReliable(h, s, a, Uint8Array.of(1, 2)))
          if (p.handle !== h || p.sequence !== s || p.ackNext !== a || p.payload.length !== 2) throw new Error(`mismatch ${h}/${a}/${s}`)
          n++
        }
    expect(n).toBe(32768)
  })

  it('handles revisions and modular distance', () => {
    expect(sequenceCount(0)).toBe(64)
    expect(sequenceCount(255)).toBe(8)
    expect(() => sequenceCount(1)).toThrow()
    expect(seqDistance(63, 1, 64)).toBe(2)
    expect(seqDistance(7, 1, 8)).toBe(2)
    expect(() => decodeReliable(Uint8Array.of(0x80))).toThrow()
  })
})

/** Two endpoints joined by a link that can drop, duplicate or reorder packets. */
function link(opts: { drop?: (n: number, p: Uint8Array) => boolean; duplicate?: (n: number) => boolean; revision?: number } = {}) {
  const received: number[] = []
  let n = 0
  let host!: ReliableChannel
  let band!: ReliableChannel
  const deliver = (to: () => ReliableChannel) => (p: Uint8Array) => {
    const i = n++
    if (opts.drop?.(i, p)) return
    setTimeout(() => to().receive(p), 2)
    if (opts.duplicate?.(i)) setTimeout(() => to().receive(p), 3)
  }
  host = new ReliableChannel({ handle: 0x81, revision: opts.revision ?? 0, write: deliver(() => band), onData: (d) => received.push(...d) })
  band = new ReliableChannel({ handle: 0x81, revision: opts.revision ?? 0, write: deliver(() => host), onData: () => {} })
  return { host, band, received }
}

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i & 0xff)

describe('reliable channel state machine (simulated band)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('delivers a large transfer in order across several sequence wraps', async () => {
    const { host, band, received } = link()
    const data = bytes(18 * 200) // 200 packets → wraps the 64-sequence space three times
    const done = band.send(data)
    await vi.advanceTimersByTimeAsync(5000)
    await done
    expect(Uint8Array.from(received)).toEqual(data)
    expect(host.stats.duplicates).toBe(0)
  })

  it('recovers from dropped data and dropped ACKs by retransmitting', async () => {
    const { band, received } = link({ drop: (i) => i % 7 === 3 })
    const data = bytes(18 * 80)
    const done = band.send(data)
    await vi.advanceTimersByTimeAsync(60_000)
    await done
    expect(Uint8Array.from(received)).toEqual(data)
    expect(band.stats.retransmitted).toBeGreaterThan(0)
  })

  it('ignores duplicated packets without redelivering them', async () => {
    const { host, band, received } = link({ duplicate: (i) => i % 3 === 0 })
    const data = bytes(18 * 40)
    const done = band.send(data)
    await vi.advanceTimersByTimeAsync(10_000)
    await done
    expect(Uint8Array.from(received)).toEqual(data)
    expect(host.stats.duplicates).toBeGreaterThan(0)
  })

  it('works in the revision-255 (modulo 8) space', async () => {
    const { band, received } = link({ revision: 255, drop: (i) => i === 5 })
    const data = bytes(18 * 30)
    const done = band.send(data)
    await vi.advanceTimersByTimeAsync(30_000)
    await done
    expect(Uint8Array.from(received)).toEqual(data)
  })

  it('does not advance the receive sequence on ACK-only packets', () => {
    const got: Uint8Array[] = []
    const ch = new ReliableChannel({ handle: 0x80, revision: 0, write: () => {}, onData: (d) => got.push(d) })
    ch.receive(encodeReliable(0x80, 0, 0)) // ACK-only with S=0
    ch.receive(encodeReliable(0x80, 0, 0, Uint8Array.of(9))) // real data S=0 must still be accepted
    expect(got.map((g) => g[0])).toEqual([9])
  })

  it('fails cleanly when the band stops answering, instead of retrying forever', async () => {
    const closed: (Error | null)[] = []
    const ch = new ReliableChannel({ handle: 0x80, revision: 0, write: () => {}, onData: () => {}, onClose: (e) => closed.push(e), maxRetries: 3 })
    const sent = ch.send(Uint8Array.of(0, 0, 1, 0, 0, 0))
    sent.catch(() => {})
    await vi.advanceTimersByTimeAsync(120_000)
    await expect(sent).rejects.toThrow()
    expect(closed[0]?.message).toMatch(/stopped acknowledging/)
  })
})
