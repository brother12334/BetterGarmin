import { useCallback, useEffect, useRef, useState } from 'react'

export type LiveHrStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected'

export interface LiveHrReading {
  t: number
  bpm: number
}

const HEART_RATE_SERVICE = 'heart_rate'
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement'
const MAX_HISTORY = 60

/** Parses a BLE GATT Heart Rate Measurement value (Bluetooth SIG spec). */
function parseHeartRateMeasurement(value: DataView): number {
  const flags = value.getUint8(0)
  const is16Bit = (flags & 0x1) !== 0
  return is16Bit ? value.getUint16(1, true) : value.getUint8(1)
}

export function useLiveHeartRate() {
  const [status, setStatus] = useState<LiveHrStatus>(() =>
    typeof navigator !== 'undefined' && navigator.bluetooth ? 'disconnected' : 'unsupported',
  )
  const [bpm, setBpm] = useState<number | null>(null)
  const [history, setHistory] = useState<LiveHrReading[]>([])
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const deviceRef = useRef<BluetoothDevice | null>(null)
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null)

  const handleValueChanged = useCallback((ev: Event) => {
    const target = ev.target as BluetoothRemoteGATTCharacteristic
    if (!target.value) return
    const nextBpm = parseHeartRateMeasurement(target.value)
    setBpm(nextBpm)
    setHistory((prev) => {
      const next = [...prev, { t: Date.now(), bpm: nextBpm }]
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
    })
  }, [])

  const cleanup = useCallback(() => {
    try {
      characteristicRef.current?.removeEventListener('characteristicvaluechanged', handleValueChanged)
      characteristicRef.current?.stopNotifications().catch(() => {})
    } catch {
      // device may already be gone
    }
    characteristicRef.current = null
    try {
      if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect()
    } catch {
      // already disconnected
    }
    deviceRef.current = null
  }, [handleValueChanged])

  const disconnect = useCallback(() => {
    cleanup()
    setStatus('disconnected')
    setBpm(null)
    setHistory([])
    setDeviceName(null)
  }, [cleanup])

  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      setStatus('unsupported')
      return
    }
    setStatus('connecting')
    setError(null)
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
      })
      deviceRef.current = device
      device.addEventListener('gattserverdisconnected', () => {
        setStatus('disconnected')
        setBpm(null)
      })

      if (!device.gatt) throw new Error('This device does not support a GATT connection.')
      const server = await device.gatt.connect()
      const service = await server.getPrimaryService(HEART_RATE_SERVICE)
      const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT)
      characteristicRef.current = characteristic
      characteristic.addEventListener('characteristicvaluechanged', handleValueChanged)
      await characteristic.startNotifications()

      setDeviceName(device.name || 'Heart rate monitor')
      setStatus('connected')
    } catch (err) {
      cleanup()
      setStatus('disconnected')
      const message = err instanceof Error ? err.message : String(err)
      // the user closing the browser's device picker isn't a real error
      if (!/cancelled|user gesture/i.test(message)) setError(message)
    }
  }, [cleanup, handleValueChanged])

  useEffect(() => cleanup, [cleanup])

  return { status, bpm, history, deviceName, error, connect, disconnect }
}
