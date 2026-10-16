import { useSyncExternalStore } from 'react'

export type LiveHrStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected'

const HEART_RATE_SERVICE = 'heart_rate'
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement'

/** Parses a BLE GATT Heart Rate Measurement value (Bluetooth SIG spec). */
function parseHeartRateMeasurement(value: DataView): number {
  const flags = value.getUint8(0)
  const is16Bit = (flags & 0x1) !== 0
  return is16Bit ? value.getUint16(1, true) : value.getUint8(1)
}

interface LiveHrState {
  status: LiveHrStatus
  bpm: number | null
  deviceName: string | null
  error: string | null
}

// The connection lives at module level, not in a component, so it survives navigating between pages.
let state: LiveHrState = {
  status: typeof navigator !== 'undefined' && navigator.bluetooth ? 'disconnected' : 'unsupported',
  bpm: null,
  deviceName: null,
  error: null,
}
const listeners = new Set<() => void>()
let device: BluetoothDevice | null = null
let characteristic: BluetoothRemoteGATTCharacteristic | null = null

function set(patch: Partial<LiveHrState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function handleValueChanged(ev: Event) {
  const target = ev.target as BluetoothRemoteGATTCharacteristic
  if (target.value) set({ bpm: parseHeartRateMeasurement(target.value) })
}

function cleanup() {
  try {
    characteristic?.removeEventListener('characteristicvaluechanged', handleValueChanged)
    characteristic?.stopNotifications().catch(() => {})
  } catch {
    // device may already be gone
  }
  characteristic = null
  try {
    if (device?.gatt?.connected) device.gatt.disconnect()
  } catch {
    // already disconnected
  }
  device = null
}

function disconnect() {
  cleanup()
  set({ status: 'disconnected', bpm: null, deviceName: null })
}

async function connect() {
  if (!navigator.bluetooth) {
    set({ status: 'unsupported' })
    return
  }
  set({ status: 'connecting', error: null })
  try {
    const picked = await navigator.bluetooth.requestDevice({ filters: [{ services: [HEART_RATE_SERVICE] }] })
    device = picked
    picked.addEventListener('gattserverdisconnected', () => {
      if (device === picked) set({ status: 'disconnected', bpm: null })
    })
    if (!picked.gatt) throw new Error('This device does not support a GATT connection.')
    const server = await picked.gatt.connect()
    const service = await server.getPrimaryService(HEART_RATE_SERVICE)
    characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT)
    characteristic.addEventListener('characteristicvaluechanged', handleValueChanged)
    await characteristic.startNotifications()
    set({ status: 'connected', deviceName: picked.name || 'Heart rate monitor' })
  } catch (err) {
    cleanup()
    const message = err instanceof Error ? err.message : String(err)
    // the user closing the browser's device picker isn't a real error
    set({ status: 'disconnected', error: /cancelled|user gesture/i.test(message) ? null : message })
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLiveHeartRate() {
  const s = useSyncExternalStore(subscribe, () => state)
  return { ...s, connect, disconnect }
}
