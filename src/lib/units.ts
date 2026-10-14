export type UnitSystem = 'metric' | 'imperial'

const KM_TO_MI = 0.621371
const KG_TO_LB = 2.20462
const M_TO_FT = 3.28084

export function convertDistance(km: number, system: UnitSystem): number {
  return system === 'imperial' ? km * KM_TO_MI : km
}

export function convertWeight(kg: number, system: UnitSystem): number {
  return system === 'imperial' ? kg * KG_TO_LB : kg
}

export function convertElevation(m: number, system: UnitSystem): number {
  return system === 'imperial' ? m * M_TO_FT : m
}

export function convertSpeed(kmh: number, system: UnitSystem): number {
  return system === 'imperial' ? kmh * KM_TO_MI : kmh
}

export function distanceUnitLabel(system: UnitSystem): string {
  return system === 'imperial' ? 'mi' : 'km'
}

export function weightUnitLabel(system: UnitSystem): string {
  return system === 'imperial' ? 'lb' : 'kg'
}

export function elevationUnitLabel(system: UnitSystem): string {
  return system === 'imperial' ? 'ft' : 'm'
}

export function speedUnitLabel(system: UnitSystem): string {
  return system === 'imperial' ? 'mph' : 'km/h'
}

export function formatDistance(km: number | null | undefined, system: UnitSystem, decimals = 1): string {
  if (km == null) return '—'
  return `${convertDistance(km, system).toFixed(decimals)} ${distanceUnitLabel(system)}`
}

export function formatWeight(kg: number | null | undefined, system: UnitSystem, decimals = 1): string {
  if (kg == null) return '—'
  return `${convertWeight(kg, system).toFixed(decimals)} ${weightUnitLabel(system)}`
}

export function formatElevation(m: number | null | undefined, system: UnitSystem): string {
  if (m == null) return '—'
  return `${Math.round(convertElevation(m, system))} ${elevationUnitLabel(system)}`
}

export function formatSpeed(kmh: number | null | undefined, system: UnitSystem, decimals = 1): string {
  if (kmh == null) return '—'
  return `${convertSpeed(kmh, system).toFixed(decimals)} ${speedUnitLabel(system)}`
}
