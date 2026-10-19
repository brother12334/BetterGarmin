import { hex } from './bytes'
import { CobsStream, cobsEncode } from './cobs'
import {
  MSG,
  decodeFrame,
  encodeFrame,
  ackPayload,
  hostConfiguration,
  hostDeviceInformation,
  parseDeviceInformation,
  parseProtobufPayload,
  protobufAck,
  protobufPayload,
  readConfigurationBits,
  readU16Safe,
  type GfdiFrame,
} from './gfdi'
import { BAND_UUIDS, GFDI_SERVICE, closeHandleRequest, fragment, isCloseHandleResponse, parseRegisterResponse, registerRequest, type RegisterResponse } from './multilink'
import { decodeMessage, type ProtoField } from './proto'

export type SessionState = 'idle' | 'connecting' | 'registering' | 'handshaking' | 'ready' | 'reconnecting' | 'disconnected' | 'error'

export interface LogEntry {
  t: number
  dir: 'out' | 'in' | 'info' | 'error'
  text: string
}

export interface SmartMessage {
  /** 'response' = 5044 answering one of our requests; 'request' = 5043 the band started (events, its own requests). */
  kind: 'request' | 'response'
  requestId: number
  fields: ProtoField[] | null
  raw: Uint8Array
}

export interface SentSmart {
  requestId: number
  /** Resolves once every frame has been written to Bluetooth. */
  sent: Promise<void>
  /** Resolves when the band acknowledges the 5043 transport frame (delivery only, not acceptance). */
  delivered: Promise<void>
  /** Resolves with the band's 5044 response for this request ID. */
  response: Promise<SmartMessage>
}

type Listener = () => void

const PROTOBUF_CHUNK = 400 // well under the band's reported 512-byte GFDI packet limit
const STEP_TIMEOUT_MS = 10_000
const SMART_TIMEOUT_MS = 15_000

function timeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timed out waiting for ${what}`)), ms)
    p.then(
      (v) => {
        clearTimeout(id)
        resolve(v)
      },
      (e) => {
        clearTimeout(id)
        reject(e)
      },
    )
  })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  promise.catch(() => {}) // callers that never await shouldn't produce unhandled rejections
  return { promise, resolve, reject }
}

/**
 * One Web Bluetooth connection to a CIRQA: MultiLink registration, the GFDI handshake, and protobuf
 * request/response routing. Higher-level features (activity control, alerts, files) live in bandStore.
 */
export class BandSession {
  state: SessionState = 'idle'
  deviceName: string | null = null
  /** Web Bluetooth's stable per-site device ID; used to key synced files. */
  deviceId: string | null = null
  error: { message: string; raw: string } | null = null
  bandProtocolVersion: number | null = null
  bandConfigBits: number[] = []
  routingHandle: number | null = null
  info: string | null = null
  log: LogEntry[] = []
  /** Battery percentage from the standard Battery Service, when the band exposes it (unverified on CIRQA). */
  batteryPercent: number | null = null

  private userDisconnect = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private device: BluetoothDevice | null = null
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null
  private stream = new CobsStream()
  private writeChain: Promise<void> = Promise.resolve()
  private smartChain: Promise<void> = Promise.resolve()
  private nextRequestId = 1
  private pendingResponses = new Map<number, ReturnType<typeof deferred<SmartMessage>>>()
  private pendingDelivery = new Map<number, ReturnType<typeof deferred<void>>>()
  private reassembly = new Map<string, { total: number; parts: Uint8Array[]; got: number }>()
  private registered = deferred<number>()
  private configAcked = deferred<void>()
  private listeners = new Set<Listener>()
  private disconnectListeners = new Set<() => void>()
  private reliableReceivers = new Map<number, (packet: Uint8Array) => void>()
  private registerWaiters = new Map<number, (r: RegisterResponse & { raw?: Uint8Array }) => void>()
  private closeWaiters = new Map<number, (r: { service: number; handle: number; status: number }) => void>()
  private smartListeners = new Set<(m: SmartMessage) => boolean | void>()

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  /** Listeners return true when they handled a band-initiated request. */
  onSmart(l: (m: SmartMessage) => boolean | void): () => void {
    this.smartListeners.add(l)
    return () => this.smartListeners.delete(l)
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }

  private setState(s: SessionState) {
    this.state = s
    this.emit()
  }

  addLog(dir: LogEntry['dir'], text: string) {
    this.log = [...this.log.slice(-299), { t: Date.now(), dir, text }]
    this.emit()
  }

  /** Opens the browser's device chooser, connects and completes registration + handshake. */
  /**
   * Opens the device chooser and connects. With `reuse`, reconnects to the band chosen earlier without the chooser
   * (no tap needed, so it can run after an unexpected disconnect).
   */
  async connect(opts: { showAll?: boolean; reuse?: boolean } = {}): Promise<void> {
    if (this.state === 'connecting' || this.state === 'registering' || this.state === 'handshaking' || this.state === 'ready') return
    this.userDisconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (!navigator.bluetooth) throw new Error('This browser has no Web Bluetooth. On iPhone, use Bluefy (or Safari with a Web Bluetooth extension).')
    this.error = null
    this.registered = deferred<number>()
    this.configAcked = deferred<void>()
    this.stream.reset()
    this.setState('connecting')
    try {
      const optionalServices = [BAND_UUIDS.MULTILINK_SERVICE, BAND_UUIDS.HEART_RATE_SERVICE, 'battery_service']
      const reuse = opts.reuse && this.device ? this.device : null
      this.device = reuse ?? await navigator.bluetooth.requestDevice(
        opts.showAll
          ? { acceptAllDevices: true, optionalServices }
          : // Same request as the tested Protocol Lab: a name-prefix filter only. Adding a service filter left
            // Bluefy's chooser empty, because the band doesn't advertise the MultiLink service.
            { filters: [{ namePrefix: 'CIRQA' }], optionalServices },
      )
      this.deviceName = this.device.name ?? 'Garmin band'
      this.deviceId = this.device.id ?? null
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect)
      this.addLog('info', reuse ? `Reconnecting to ${this.deviceName}` : `Selected ${this.deviceName}`)
      const server = await this.device.gatt!.connect()
      const service = await server.getPrimaryService(BAND_UUIDS.MULTILINK_SERVICE)
      this.notifyChar = await service.getCharacteristic(BAND_UUIDS.NOTIFY)
      this.writeChar = await service.getCharacteristic(BAND_UUIDS.WRITE)
      // Subscribe before registering, or the registration response can be missed.
      this.notifyChar.addEventListener('characteristicvaluechanged', this.handleNotify)
      await this.notifyChar.startNotifications()
      this.addLog('info', 'Notifications on')
      try {
        const infoChar = await service.getCharacteristic(BAND_UUIDS.INFO)
        const v = await infoChar.readValue()
        this.info = hex(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
        this.addLog('in', `info characteristic: ${this.info}`)
      } catch {
        // optional
      }

      this.setState('registering')
      await this.writeRaw(registerRequest())
      this.addLog('out', `register GFDI (service ${GFDI_SERVICE}, client 1)`)
      this.routingHandle = await timeout(this.registered.promise, STEP_TIMEOUT_MS, 'the registration response')
      this.addLog('info', `registered, routing handle ${this.routingHandle}`)

      this.setState('handshaking')
      await timeout(this.configAcked.promise, 20_000, 'the band to finish the handshake')
      this.setState('ready')
      this.addLog('info', 'session ready')
      void this.readBattery(server)
    } catch (err) {
      // Keep the browser's exact error (Bluefy has returned a bare "2") instead of guessing what it means.
      const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      const message = err instanceof Error ? err.message : String(err)
      this.error = { message: message || raw, raw }
      this.addLog('error', raw)
      this.cleanup()
      this.setState('error')
      throw err
    }
  }

  /** Best effort: the standard Battery Service. Many Garmin bands don't expose it, so this often stays null. */
  private async readBattery(server: BluetoothRemoteGATTServer) {
    try {
      const svc = await server.getPrimaryService('battery_service')
      const ch = await svc.getCharacteristic('battery_level')
      const v = await ch.readValue()
      this.batteryPercent = v.getUint8(0)
      this.addLog('info', `battery ${this.batteryPercent}%`)
      this.emit()
    } catch {
      this.batteryPercent = null
    }
  }

  disconnect() {
    this.userDisconnect = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    try {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    } catch {
      // already gone
    }
    this.cleanup()
    this.setState('disconnected')
  }

  private cleanup() {
    this.notifyChar?.removeEventListener('characteristicvaluechanged', this.handleNotify)
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnect)
    this.notifyChar = null
    this.writeChar = null
    this.routingHandle = null
    const gone = new Error('Band disconnected')
    this.pendingResponses.forEach((d) => d.reject(gone))
    this.pendingDelivery.forEach((d) => d.reject(gone))
    this.pendingResponses.clear()
    this.pendingDelivery.clear()
    this.reassembly.clear()
    this.reliableReceivers.clear()
    this.registerWaiters.clear()
    this.closeWaiters.clear()
    this.disconnectListeners.forEach((l) => l())
  }

  private handleDisconnect = () => {
    this.addLog('info', 'band disconnected')
    this.cleanup()
    if (this.userDisconnect || !this.device) {
      this.setState('disconnected')
      return
    }
    // Unexpected drop (out of range, band busy): try to come back on our own a few times.
    this.setState('reconnecting')
    const delays = [1000, 3000, 8000]
    const attempt = (i: number) => {
      this.reconnectTimer = setTimeout(async () => {
        this.reconnectTimer = null
        if (this.userDisconnect) return
        try {
          this.state = 'disconnected' // let connect() run
          await this.connect({ reuse: true })
        } catch {
          if (i + 1 < delays.length && !this.userDisconnect) {
            this.setState('reconnecting')
            attempt(i + 1)
          } else this.setState('disconnected')
        }
      }, delays[i])
    }
    attempt(0)
  }

  private async writeRaw(bytes: Uint8Array): Promise<void> {
    const ch = this.writeChar
    if (!ch) throw new Error('Not connected')
    const job = this.writeChain.then(async () => {
      const buf = bytes.slice().buffer
      if (ch.properties?.writeWithoutResponse && ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(buf)
      else if (ch.writeValueWithResponse) await ch.writeValueWithResponse(buf)
      else if (ch.writeValue) await ch.writeValue(buf)
      else throw new Error('Characteristic is not writable')
    })
    this.writeChain = job.catch(() => {})
    return job
  }

  private async sendFrame(frame: Uint8Array, label: string): Promise<void> {
    if (this.routingHandle == null) throw new Error('Not registered')
    for (const w of fragment(this.routingHandle, cobsEncode(frame))) await this.writeRaw(w)
    this.addLog('out', label)
  }

  /** Registers an extra MultiLink service (e.g. a reliable file pipe) and returns the band's response. */
  async registerService(service: number, options: number): Promise<RegisterResponse> {
    if (this.state !== 'ready') throw new Error('Band is not connected')
    const resp = new Promise<RegisterResponse>((resolve) => this.registerWaiters.set(service, resolve))
    await this.writeRaw(registerRequest(service, 1, options))
    this.addLog('out', `register service 0x${service.toString(16)} (options ${options})`)
    return timeout(resp, STEP_TIMEOUT_MS, `the registration of service 0x${service.toString(16)}`)
  }

  /** Asks the band to close a registered service. Resolves false if it didn't answer in time. */
  async closeService(service: number, handle: number): Promise<boolean> {
    if (!this.writeChar) return false
    const resp = new Promise<boolean>((resolve) => this.closeWaiters.set(service, () => resolve(true)))
    try {
      await this.writeRaw(closeHandleRequest(service, handle))
      this.addLog('out', `close service 0x${service.toString(16)} handle 0x${handle.toString(16)}`)
      return await timeout(resp, 3000, 'the close response')
    } catch {
      this.closeWaiters.delete(service)
      return false
    } finally {
      this.reliableReceivers.delete(handle)
    }
  }

  /** Called whenever the connection drops or is closed. */
  onDisconnect(fn: () => void): () => void {
    this.disconnectListeners.add(fn)
    return () => this.disconnectListeners.delete(fn)
  }

  /** Routes packets for a reliable handle to `fn`; returns an unsubscribe. */
  onReliable(handle: number, fn: (packet: Uint8Array) => void): () => void {
    this.reliableReceivers.set(handle, fn)
    return () => this.reliableReceivers.delete(handle)
  }

  /** Writes one already-framed reliable packet (header carries the handle). */
  writeReliable(packet: Uint8Array): Promise<void> {
    return this.writeRaw(packet)
  }

  /** Sends a Smart protobuf payload as a 5043 request, fragmenting if needed. */
  sendSmart(bytes: number[] | Uint8Array, label: string): SentSmart {
    const requestId = this.nextRequestId
    this.nextRequestId = (this.nextRequestId % 0xfffe) + 1
    const data = Uint8Array.from(bytes)
    const response = deferred<SmartMessage>()
    const delivered = deferred<void>()
    this.pendingResponses.set(requestId, response)
    this.pendingDelivery.set(requestId, delivered)
    // Like the tested client, keep one Smart request outstanding at a time: wait for the previous answer (or its timeout).
    const previous = this.smartChain
    const settled = response.promise.then(
      () => undefined,
      () => undefined,
    )
    this.smartChain = previous.then(() => Promise.race([settled, new Promise<void>((r) => setTimeout(r, SMART_TIMEOUT_MS))]))
    const sent = (async () => {
      await previous
      if (this.state !== 'ready') throw new Error('Band is not connected')
      for (let o = 0; o < Math.max(1, data.length); o += PROTOBUF_CHUNK) {
        const chunk = data.slice(o, o + PROTOBUF_CHUNK)
        await this.sendFrame(encodeFrame(MSG.PROTOBUF_REQUEST, protobufPayload({ requestId, offset: o, total: data.length, data: chunk })), `5043 #${requestId} ${label}`)
      }
    })()
    sent.catch((e) => {
      response.reject(e)
      delivered.reject(e)
    })
    return { requestId, sent, delivered: delivered.promise, response: response.promise }
  }

  private handleNotify = (ev: Event) => {
    const v = (ev.target as BluetoothRemoteGATTCharacteristic).value
    if (!v) return
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice()
    if (bytes.length === 0) return
    const handle = bytes[0]
    if (handle & 0x80) {
      // Reliable channels (file pipes) carry their own handle bits; never COBS/GFDI-decode them.
      this.reliableReceivers.get(0x80 | ((handle >> 4) & 7))?.(bytes)
      return
    }
    if (handle === 0) {
      const resp = parseRegisterResponse(bytes)
      const closed = isCloseHandleResponse(bytes)
      if (closed) {
        this.addLog('in', `close response: service 0x${closed.service.toString(16)}, handle ${closed.handle}, status ${closed.status}`)
        this.closeWaiters.get(closed.service)?.(closed)
        this.closeWaiters.delete(closed.service)
        return
      }
      if (resp && resp.service !== GFDI_SERVICE) {
        this.addLog('in', `register response: service 0x${resp.service.toString(16)}, status ${resp.status}, handle 0x${resp.handle.toString(16)}, options ${resp.options}`)
        this.registerWaiters.get(resp.service)?.(resp)
        this.registerWaiters.delete(resp.service)
        return
      }
      if (resp && resp.service === GFDI_SERVICE) {
        this.addLog('in', `register response: status ${resp.status}, handle ${resp.handle}`)
        if (resp.status === 0) {
          // Store the handle right away: the band can start the handshake on it before the connect flow resumes.
          this.routingHandle = resp.handle
          this.registered.resolve(resp.handle)
        }
        else this.registered.reject(new Error(`Band refused registration (status ${resp.status})`))
      } else {
        this.addLog('in', `management: ${hex(bytes)}`)
      }
      return
    }
    if (handle !== this.routingHandle) return
    for (const raw of this.stream.push(bytes.slice(1))) {
      const r = decodeFrame(raw)
      if (!r.ok) {
        this.addLog('error', `bad frame (${r.error}): ${hex(raw.slice(0, 24))}…`)
        continue
      }
      void this.handleFrame(r.frame).catch((e) => this.addLog('error', `handling ${r.frame.messageId}: ${String(e)}`))
    }
  }

  private async handleFrame(frame: GfdiFrame) {
    const { messageId, payload, tag } = frame
    if (messageId >= 5101 && messageId <= 5112) {
      // Proprietary authentication isn't implemented; never guess a reply.
      const err = new Error(`The band asked for authentication (${messageId}). BetterGarmin doesn't support that, so it stopped.`)
      this.addLog('error', err.message)
      this.configAcked.reject(err)
      this.error = { message: err.message, raw: `GFDI ${messageId}` }
      this.disconnect()
      this.setState('error')
      return
    }
    switch (messageId) {
      case MSG.DEVICE_INFORMATION: {
        const info = parseDeviceInformation(payload)
        this.bandProtocolVersion = info.protocolVersion
        this.addLog('in', `5024 device information (protocol ${info.protocolVersion})`)
        await this.sendFrame(hostDeviceInformation(tag), '5000 ack 5024 + host device information')
        return
      }
      case MSG.CONFIGURATION: {
        this.bandConfigBits = readConfigurationBits(payload)
        this.addLog('in', `5050 configuration (${this.bandConfigBits.length} capability bits)`)
        await this.sendFrame(encodeFrame(MSG.ACK, ackPayload(MSG.CONFIGURATION), tag), '5000 ack 5050')
        await this.sendFrame(hostConfiguration(), '5050 host configuration')
        return
      }
      case MSG.ACK: {
        const original = readU16Safe(payload, 0)
        const status = payload[2]
        if (original === MSG.CONFIGURATION) {
          this.addLog('in', `ack 5050 (status ${status})`)
          if (status === 0) this.configAcked.resolve()
          else this.configAcked.reject(new Error(`Band rejected configuration (status ${status})`))
        } else if (original === MSG.PROTOBUF_REQUEST) {
          const requestId = readU16Safe(payload, 3)
          this.addLog('in', `ack 5043 #${requestId} (status ${status})`)
          this.pendingDelivery.get(requestId)?.resolve()
          this.pendingDelivery.delete(requestId)
        } else {
          this.addLog('in', `ack ${original} (status ${status})`)
        }
        return
      }
      case MSG.PROTOBUF_REQUEST:
      case MSG.PROTOBUF_RESPONSE: {
        const chunk = parseProtobufPayload(payload)
        if (!chunk) {
          this.addLog('error', `malformed ${messageId}`)
          return
        }
        const key = `${messageId}:${chunk.requestId}`
        const entry = this.reassembly.get(key) ?? { total: chunk.total, parts: [], got: 0 }
        if (chunk.offset !== entry.got || chunk.total !== entry.total) {
          // Repeated fragment: acknowledge as a duplicate; anything else out of order is dropped.
          if (chunk.offset < entry.got) await this.sendFrame(protobufAck(messageId, chunk, 0, 101, tag), `5000 ack ${messageId} #${chunk.requestId} (duplicate)`)
          else this.addLog('error', `out-of-order ${messageId} fragment #${chunk.requestId}`)
          return
        }
        entry.parts.push(chunk.data)
        entry.got += chunk.data.length
        this.reassembly.set(key, entry)
        if (entry.got < entry.total) {
          await this.sendFrame(protobufAck(messageId, chunk, 0, 0, tag), `5000 ack ${messageId} #${chunk.requestId}`)
          return
        }
        this.reassembly.delete(key)
        const raw = new Uint8Array(entry.total)
        let o = 0
        for (const p of entry.parts) {
          raw.set(p.slice(0, entry.total - o), o)
          o += p.length
        }
        const msg: SmartMessage = { kind: messageId === MSG.PROTOBUF_RESPONSE ? 'response' : 'request', requestId: chunk.requestId, fields: decodeMessage(raw), raw }
        // Band-initiated requests nobody handles are acknowledged as not handled (status 1, detail 201), like the tested client.
        const handled = msg.kind === 'response' || [...this.smartListeners].some((l) => l(msg) === true)
        await this.sendFrame(protobufAck(messageId, chunk, handled ? 0 : 1, handled ? 0 : 201, tag), `5000 ack ${messageId} #${chunk.requestId}`)
        this.addLog('in', `${messageId} #${chunk.requestId} (${raw.length} bytes) ${hex(raw.slice(0, 32))}${raw.length > 32 ? '…' : ''}`)
        if (msg.kind === 'response') {
          this.pendingResponses.get(chunk.requestId)?.resolve(msg)
          this.pendingResponses.delete(chunk.requestId)
          this.smartListeners.forEach((l) => l(msg))
        }
        return
      }
      case 5027:
        this.addLog('in', '5027 handshake capabilities')
        await this.sendFrame(encodeFrame(MSG.ACK, ackPayload(5027, 0, [0]), tag), '5000 ack 5027')
        return
      case 5045:
        this.addLog('in', '5045 band cancelled a protobuf request')
        this.pendingResponses.forEach((d) => d.reject(new Error('The band cancelled the request')))
        this.pendingResponses.clear()
        return
      default:
        // Unknown requests aren't answered: a guessed reply could be read as agreement.
        this.addLog('in', `message ${messageId} (${payload.length} bytes), not handled`)
    }
  }
}
