/**
 * Minimal Web Bluetooth ambient types — not part of TypeScript's built-in DOM
 * lib. Covers only what useLiveHeartRate.ts actually uses.
 */

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly value: DataView | undefined
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  addEventListener(
    type: 'characteristicvaluechanged',
    listener: (this: BluetoothRemoteGATTCharacteristic, ev: Event) => void,
  ): void
  removeEventListener(
    type: 'characteristicvaluechanged',
    listener: (this: BluetoothRemoteGATTCharacteristic, ev: Event) => void,
  ): void
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string | number): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>
}

interface BluetoothDevice extends EventTarget {
  readonly id: string
  readonly name?: string
  readonly gatt?: BluetoothRemoteGATTServer
  addEventListener(type: 'gattserverdisconnected', listener: (this: BluetoothDevice, ev: Event) => void): void
  removeEventListener(type: 'gattserverdisconnected', listener: (this: BluetoothDevice, ev: Event) => void): void
}

interface RequestDeviceOptions {
  filters?: { services?: (string | number)[]; name?: string; namePrefix?: string }[]
  optionalServices?: (string | number)[]
  acceptAllDevices?: boolean
}

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>
}

interface Navigator {
  readonly bluetooth?: Bluetooth
}
