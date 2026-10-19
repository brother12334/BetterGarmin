/**
 * Reliable MultiLink channel (the transport FileAccess downloads use), from the recovered native behaviour in
 * CIRQA-Sync-Protocol/PROTOCOL.md:
 *
 *   byte0 = 0x80 | ((H & 7) << 4) | (A >> 2)      H = negotiated reliable handle (0x80–0x87)
 *   byte1 = ((A & 3) << 6) | S                    A = cumulative next-expected ACK, S = packet sequence
 *   rest  = application payload                   (no COBS, no CRC, no GFDI framing)
 *
 * Sequence space: revision 0 → 64, revision 255 → 8. ACK-only packets are two bytes, S = 0, and never advance the
 * receive sequence. Delayed ACK: 10 ms after the first unacknowledged payload, or immediately after 5. Retransmission:
 * RTO starts at 1000 ms, adapts with a 500 ms floor, doubles on timeout up to 20 s, halves the congestion window and
 * rewinds to the oldest unacknowledged packet.
 */

export interface ReliableHeader {
  handle: number
  ackNext: number
  sequence: number
  payload: Uint8Array
  ackOnly: boolean
}

export function encodeReliable(handle: number, sequence: number, ackNext: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  if (handle < 0x80 || handle > 0x87) throw new Error('Expected a negotiated reliable handle 0x80–0x87')
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 63) throw new Error('Invalid sequence')
  if (!Number.isInteger(ackNext) || ackNext < 0 || ackNext > 63) throw new Error('Invalid ACK')
  const out = new Uint8Array(2 + payload.length)
  out[0] = 0x80 | ((handle & 7) << 4) | (ackNext >> 2)
  out[1] = ((ackNext & 3) << 6) | sequence
  out.set(payload, 2)
  return out
}

export function decodeReliable(wire: Uint8Array): ReliableHeader {
  if (wire.length < 2 || !(wire[0] & 0x80)) throw new Error('Truncated or non-reliable packet')
  return {
    handle: 0x80 | ((wire[0] >> 4) & 7),
    ackNext: ((wire[0] & 15) << 2) | (wire[1] >> 6),
    sequence: wire[1] & 63,
    payload: wire.slice(2),
    ackOnly: wire.length === 2,
  }
}

export function sequenceCount(revision: number): number {
  if (revision === 0) return 64
  if (revision === 255) return 8
  throw new Error(`Unsupported reliable revision ${revision}`)
}

/** Forward distance from `from` to `to` in a modular sequence space. */
export function seqDistance(from: number, to: number, count: number): number {
  return (to - from + count) % count
}

export interface Timers {
  now(): number
  set(fn: () => void, ms: number): unknown
  clear(id: unknown): void
}

export const realTimers: Timers = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}

export interface ReliableOptions {
  handle: number
  revision: number
  /** Writes one complete packet (header + payload) to Bluetooth. */
  write: (packet: Uint8Array) => Promise<void> | void
  /** Called with each in-order application payload. */
  onData: (payload: Uint8Array) => void
  /** Called once when the channel fails (retransmission exhausted, write error) or is closed. */
  onClose?: (error: Error | null) => void
  /** Bytes per Bluetooth write; the payload budget is this minus the 2-byte header. */
  writeBudget?: number
  /** Retransmission timeouts allowed for one packet before the channel fails. */
  maxRetries?: number
  timers?: Timers
}

const RTO_INITIAL = 1000
const RTO_MIN = 500
const RTO_MAX = 20000
const DELAYED_ACK_MS = 10
const ACK_EVERY = 5

interface Outstanding {
  sequence: number
  payload: Uint8Array
  sentAt: number
  retransmitted: boolean
  /** Set by a timeout rewind: this packet must be sent again before any new data. */
  needsSend: boolean
}

/** One reliable channel endpoint (one negotiated handle on one connection). */
export class ReliableChannel {
  readonly handle: number
  readonly count: number
  private rxExpected = 0
  private txNext = 0
  private txAck = 0
  private cwnd: number
  private rto = RTO_INITIAL
  private srtt: number | null = null
  private retries = 0
  /** Packets sent and not yet acknowledged, oldest first (all within [txAck, frontier)). */
  private inFlight: Outstanding[] = []
  /** Payload chunks not yet sent. */
  private pending: Uint8Array[] = []
  private unackedRx = 0
  private ackTimer: unknown = null
  private rtoTimer: unknown = null
  private closed = false
  private pumping = false
  private readonly timers: Timers
  private readonly budget: number
  private readonly maxRetries: number
  /** Resolvers waiting for all queued data to be acknowledged. */
  private drainWaiters: { resolve: () => void; reject: (e: Error) => void }[] = []
  stats = { sent: 0, retransmitted: 0, received: 0, duplicates: 0, acksSent: 0 }

  private readonly opts: ReliableOptions

  constructor(opts: ReliableOptions) {
    this.opts = opts
    this.handle = opts.handle
    this.count = sequenceCount(opts.revision)
    this.cwnd = Math.floor(this.count / 2)
    this.timers = opts.timers ?? realTimers
    this.budget = (opts.writeBudget ?? 20) - 2
    this.maxRetries = opts.maxRetries ?? 6
    if (this.budget < 1) throw new Error('Write budget too small for reliable packets')
  }

  get isClosed(): boolean {
    return this.closed
  }

  /** Queues application data; resolves once every byte has been acknowledged. */
  send(data: Uint8Array): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Reliable channel is closed'))
    for (let o = 0; o < Math.max(1, data.length); o += this.budget) this.pending.push(data.slice(o, o + this.budget))
    const done = new Promise<void>((resolve, reject) => this.drainWaiters.push({ resolve, reject }))
    void this.pump()
    return done
  }

  /** Feeds one received Bluetooth packet addressed to this channel. */
  receive(wire: Uint8Array): void {
    if (this.closed) return
    let pkt: ReliableHeader
    try {
      pkt = decodeReliable(wire)
    } catch {
      return
    }
    if (pkt.handle !== this.handle) return
    this.processAck(pkt.ackNext)
    if (pkt.ackOnly) return
    if (pkt.sequence >= this.count) return
    if (pkt.sequence === this.rxExpected) {
      this.rxExpected = (this.rxExpected + 1) % this.count
      this.stats.received++
      this.opts.onData(pkt.payload)
      this.scheduleAck()
    } else {
      // Duplicate or out of order: not redelivered. ACK the current next-expected so the sender can recover.
      this.stats.duplicates++
      this.sendAckNow()
    }
  }

  close(error: Error | null = null): void {
    if (this.closed) return
    this.closed = true
    this.clearTimer('ack')
    this.clearTimer('rto')
    const err = error ?? new Error('Reliable channel closed')
    this.drainWaiters.splice(0).forEach((w) => (this.inFlight.length || this.pending.length ? w.reject(err) : w.resolve()))
    this.opts.onClose?.(error)
  }

  private processAck(ackNext: number): void {
    const outstanding = seqDistance(this.txAck, this.txNext, this.count) || (this.inFlight.length ? this.count : 0)
    const advance = seqDistance(this.txAck, ackNext, this.count)
    // Only acknowledgements inside the sent range count; anything else is stale or bogus.
    if (advance === 0 || advance > Math.min(outstanding, this.inFlight.length)) return
    const now = this.timers.now()
    const acked = this.inFlight.splice(0, advance)
    for (const p of acked) {
      if (!p.retransmitted) {
        const rtt = now - p.sentAt
        this.srtt = this.srtt == null ? rtt : 0.875 * this.srtt + 0.125 * rtt
        this.rto = Math.min(RTO_MAX, Math.max(RTO_MIN, Math.round(this.srtt * 2)))
      }
    }
    this.txAck = ackNext
    this.retries = 0
    this.cwnd = Math.min(this.count - 1, this.cwnd + 1)
    // Progress after a backoff: return to the measured timeout rather than staying backed off.
    this.rto = this.srtt == null ? RTO_INITIAL : Math.min(RTO_MAX, Math.max(RTO_MIN, Math.round(this.srtt * 2)))
    this.clearTimer('rto')
    if (this.inFlight.length) this.armRto()
    if (!this.inFlight.length && !this.pending.length) this.drainWaiters.splice(0).forEach((w) => w.resolve())
    void this.pump()
  }

  /** Packets on the wire that haven't been acknowledged (excluding ones waiting to be resent). */
  private get unackedOnWire(): number {
    return this.inFlight.reduce((n, p) => n + (p.needsSend ? 0 : 1), 0)
  }

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    try {
      // Rewound packets first, in order, then new data; both limited by the congestion window.
      while (!this.closed && this.unackedOnWire < this.cwnd) {
        const rewound = this.inFlight.find((p) => p.needsSend)
        if (rewound) {
          rewound.needsSend = false
          rewound.retransmitted = true
          rewound.sentAt = this.timers.now()
          this.stats.retransmitted++
          await this.writePacket(rewound.sequence, rewound.payload)
        } else if (this.pending.length && this.inFlight.length < this.count - 1) {
          const payload = this.pending.shift()!
          const sequence = this.txNext
          this.txNext = (this.txNext + 1) % this.count
          this.inFlight.push({ sequence, payload, sentAt: this.timers.now(), retransmitted: false, needsSend: false })
          await this.writePacket(sequence, payload)
        } else {
          break
        }
        if (!this.rtoTimer) this.armRto()
      }
    } finally {
      this.pumping = false
    }
  }

  private async writePacket(sequence: number, payload: Uint8Array): Promise<void> {
    // Every data packet piggybacks the current ACK, which clears any pending delayed ACK.
    this.clearTimer('ack')
    this.unackedRx = 0
    this.stats.sent++
    try {
      await this.opts.write(encodeReliable(this.handle, sequence, this.rxExpected, payload))
    } catch (e) {
      this.close(e instanceof Error ? e : new Error(String(e)))
    }
  }

  private scheduleAck(): void {
    this.unackedRx++
    if (this.unackedRx >= ACK_EVERY) {
      this.sendAckNow()
      return
    }
    if (!this.ackTimer) this.ackTimer = this.timers.set(() => this.sendAckNow(), DELAYED_ACK_MS)
  }

  private sendAckNow(): void {
    if (this.closed) return
    this.clearTimer('ack')
    this.unackedRx = 0
    this.stats.acksSent++
    void Promise.resolve(this.opts.write(encodeReliable(this.handle, 0, this.rxExpected))).catch((e) => this.close(e instanceof Error ? e : new Error(String(e))))
  }

  private armRto(): void {
    this.rtoTimer = this.timers.set(() => this.onTimeout(), this.rto)
  }

  private onTimeout(): void {
    this.rtoTimer = null
    if (this.closed || !this.inFlight.length) return
    this.retries++
    if (this.retries > this.maxRetries) {
      this.close(new Error('The band stopped acknowledging data'))
      return
    }
    this.rto = Math.min(RTO_MAX, this.rto * 2)
    this.cwnd = Math.max(1, Math.floor(this.cwnd / 2))
    // Rewind to the oldest unacknowledged packet: everything still in flight is resent, in order, as the window allows.
    for (const p of this.inFlight) p.needsSend = true
    this.armRto()
    void this.pump()
  }

  private clearTimer(which: 'ack' | 'rto'): void {
    if (which === 'ack' && this.ackTimer) {
      this.timers.clear(this.ackTimer)
      this.ackTimer = null
    }
    if (which === 'rto' && this.rtoTimer) {
      this.timers.clear(this.rtoTimer)
      this.rtoTimer = null
    }
  }
}
