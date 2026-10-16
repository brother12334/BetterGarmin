import { useEffect, useSyncExternalStore } from 'react'

/** Every widget on the Today screen that can be moved or hidden. */
export const TODAY_WIDGETS = [
  { id: 'hero', label: 'Readiness & backdrop' },
  { id: 'sync', label: 'Sync now bar' },
  { id: 'heartRate', label: 'Heart rate' },
  { id: 'bars', label: 'Sleep / Stress / Energy bars' },
  { id: 'energy', label: 'Energy Reserve curve' },
  { id: 'stats', label: 'Steps, floors, calories, distance' },
  { id: 'lastNight', label: 'How you slept (sleep stages)' },
  { id: 'insights', label: "Today's insights" },
] as const

export type WidgetId = (typeof TODAY_WIDGETS)[number]['id']
export interface WidgetSlot {
  id: WidgetId
  visible: boolean
}

export type BackgroundMode = 'daily' | 'photo' | 'custom' | 'gradient'
export type CardStyle = 'glass' | 'liquid' | 'solid' | 'outline'
export type Radius = 'sharp' | 'rounded' | 'round'
export type FontChoice = 'manrope' | 'system' | 'serif' | 'mono'
export type GlassTint = 'clear' | 'dark'
export type Density = 'compact' | 'comfortable' | 'spacious'

export interface Appearance {
  backgroundMode: BackgroundMode
  /** Bundled photo path, for mode 'photo'. */
  photo: string
  /** Key into GRADIENTS, for mode 'gradient'. */
  gradient: string
  /** 0–80: darkening over the backdrop. */
  dim: number
  /** 0–24 px blur on the backdrop. */
  blur: number
  /** Show the backdrop behind every screen, not only the Today hero. */
  fullPage: boolean
  accent: string
  cardStyle: CardStyle
  /** Liquid cards only: bright clear glass, or smoked dark glass. */
  glassTint: GlassTint
  radius: Radius
  font: FontChoice
  density: Density
  todayLayout: WidgetSlot[]
}

export const PHOTOS = [
  { src: 'backgrounds/aurora.jpg', label: 'Aurora' },
  { src: 'backgrounds/misty-forest.jpg', label: 'Misty forest' },
  { src: 'backgrounds/foggy-valley.jpg', label: 'Foggy valley' },
  { src: 'backgrounds/matterhorn.jpg', label: 'Alpine peak' },
  { src: 'backgrounds/green-valley.jpg', label: 'Green valley' },
  { src: 'backgrounds/misty-hilltop.jpg', label: 'Misty hilltop' },
  { src: 'backgrounds/mountain-silhouette.jpg', label: 'Ridges' },
  { src: 'backgrounds/dolomites-lake.jpg', label: 'Dolomites' },
]

export const GRADIENTS: Record<string, { label: string; css: string }> = {
  liquid: {
    label: 'Liquid',
    css: 'radial-gradient(60% 40% at 15% 55%, rgba(37,99,235,0.95) 0%, rgba(37,99,235,0) 70%), radial-gradient(55% 35% at 85% 40%, rgba(59,130,246,0.85) 0%, rgba(59,130,246,0) 70%), radial-gradient(70% 50% at 50% 100%, rgba(147,197,253,0.6) 0%, rgba(147,197,253,0) 70%), linear-gradient(165deg, #0b1a4a 0%, #1e3a8a 45%, #3b82f6 100%)',
  },
  liquidMidnight: { label: 'Midnight', css: 'radial-gradient(60% 40% at 15% 55%, rgba(30,64,175,0.55) 0%, transparent 70%), radial-gradient(55% 35% at 85% 40%, rgba(76,29,149,0.5) 0%, transparent 70%), radial-gradient(70% 50% at 50% 100%, rgba(14,116,144,0.45) 0%, transparent 70%), linear-gradient(165deg, #020308 0%, #0b1024 45%, #1e293b 100%)' },
  liquidViolet: { label: 'Violet', css: 'radial-gradient(60% 40% at 15% 55%, rgba(124,58,237,0.95) 0%, transparent 70%), radial-gradient(55% 35% at 85% 40%, rgba(219,39,119,0.75) 0%, transparent 70%), radial-gradient(70% 50% at 50% 100%, rgba(196,181,253,0.55) 0%, transparent 70%), linear-gradient(165deg, #1a0b3d 0%, #5b21b6 45%, #7c3aed 100%)' },
  liquidMint: { label: 'Mint', css: 'radial-gradient(60% 40% at 15% 55%, rgba(13,148,136,0.95) 0%, transparent 70%), radial-gradient(55% 35% at 85% 40%, rgba(16,185,129,0.8) 0%, transparent 70%), radial-gradient(70% 50% at 50% 100%, rgba(153,246,228,0.5) 0%, transparent 70%), linear-gradient(165deg, #042f2e 0%, #0f766e 45%, #0d9488 100%)' },
  liquidRose: { label: 'Rose', css: 'radial-gradient(60% 40% at 15% 55%, rgba(225,29,72,0.9) 0%, transparent 70%), radial-gradient(55% 35% at 85% 40%, rgba(244,114,182,0.8) 0%, transparent 70%), radial-gradient(70% 50% at 50% 100%, rgba(254,205,211,0.5) 0%, transparent 70%), linear-gradient(165deg, #3b0716 0%, #9f1239 45%, #be123c 100%)' },
  liquidAmber: { label: 'Amber', css: 'radial-gradient(60% 40% at 15% 55%, rgba(234,88,12,0.9) 0%, transparent 70%), radial-gradient(55% 35% at 85% 40%, rgba(245,158,11,0.85) 0%, transparent 70%), radial-gradient(70% 50% at 50% 100%, rgba(254,240,138,0.5) 0%, transparent 70%), linear-gradient(165deg, #431407 0%, #b45309 45%, #d97706 100%)' },
  aurora: { label: 'Aurora', css: 'linear-gradient(135deg, #0f2027 0%, #134e5e 45%, #71b280 100%)' },
  nebula: { label: 'Nebula', css: 'linear-gradient(135deg, #1a0533 0%, #4c1d95 50%, #db2777 100%)' },
  ocean: { label: 'Ocean', css: 'linear-gradient(160deg, #020617 0%, #0c4a6e 55%, #22d3ee 100%)' },
  sunset: { label: 'Sunset', css: 'linear-gradient(150deg, #1c1917 0%, #9a3412 50%, #fbbf24 100%)' },
  ember: { label: 'Ember', css: 'radial-gradient(120% 100% at 20% 0%, #7f1d1d 0%, #1c1917 60%, #0a0a0a 100%)' },
  graphite: { label: 'Graphite', css: 'linear-gradient(180deg, #27272a 0%, #09090b 100%)' },
}

export const ACCENTS = ['#38bdf8', '#818cf8', '#a855f7', '#ec4899', '#f43f5e', '#fb923c', '#facc15', '#34d399', '#e5e7eb']

export const DEFAULT_APPEARANCE: Appearance = {
  backgroundMode: 'daily',
  photo: PHOTOS[0].src,
  gradient: 'aurora',
  dim: 25,
  blur: 0,
  fullPage: false,
  accent: '#38bdf8',
  cardStyle: 'glass',
  glassTint: 'clear',
  radius: 'round',
  font: 'manrope',
  density: 'comfortable',
  todayLayout: TODAY_WIDGETS.map((w) => ({ id: w.id, visible: true })),
}

export const PRESETS: { name: string; patch: Partial<Appearance> }[] = [
  { name: 'Liquid Glass', patch: { accent: '#60a5fa', cardStyle: 'liquid', glassTint: 'clear', radius: 'round', font: 'system', backgroundMode: 'gradient', gradient: 'liquid', dim: 0, blur: 0 } },
  { name: 'Liquid Midnight', patch: { accent: '#7dd3fc', cardStyle: 'liquid', glassTint: 'dark', radius: 'round', font: 'system', backgroundMode: 'gradient', gradient: 'liquidMidnight', dim: 0, blur: 0 } },
  { name: 'Liquid Violet', patch: { accent: '#c084fc', cardStyle: 'liquid', glassTint: 'clear', radius: 'round', font: 'system', backgroundMode: 'gradient', gradient: 'liquidViolet', dim: 0, blur: 0 } },
  { name: 'Liquid Mint', patch: { accent: '#2dd4bf', cardStyle: 'liquid', glassTint: 'clear', radius: 'round', font: 'system', backgroundMode: 'gradient', gradient: 'liquidMint', dim: 0, blur: 0 } },
  { name: 'Liquid Rose', patch: { accent: '#fb7185', cardStyle: 'liquid', glassTint: 'clear', radius: 'round', font: 'system', backgroundMode: 'gradient', gradient: 'liquidRose', dim: 0, blur: 0 } },
  { name: 'Liquid Amber', patch: { accent: '#fbbf24', cardStyle: 'liquid', glassTint: 'dark', radius: 'round', font: 'system', backgroundMode: 'gradient', gradient: 'liquidAmber', dim: 0, blur: 0 } },
  { name: 'Glacier', patch: { accent: '#38bdf8', cardStyle: 'glass', radius: 'round', font: 'manrope', backgroundMode: 'daily', fullPage: false } },
  { name: 'Neon', patch: { accent: '#a855f7', cardStyle: 'glass', radius: 'round', font: 'manrope', backgroundMode: 'gradient', gradient: 'nebula', fullPage: true, dim: 35, blur: 0 } },
  { name: 'Forest', patch: { accent: '#34d399', cardStyle: 'glass', radius: 'rounded', font: 'manrope', backgroundMode: 'photo', photo: 'backgrounds/misty-forest.jpg', fullPage: true, dim: 55, blur: 8 } },
  { name: 'Sunset', patch: { accent: '#fb923c', cardStyle: 'solid', radius: 'rounded', font: 'system', backgroundMode: 'gradient', gradient: 'sunset', fullPage: false } },
  { name: 'Terminal', patch: { accent: '#e5e7eb', cardStyle: 'outline', radius: 'sharp', font: 'mono', backgroundMode: 'gradient', gradient: 'graphite', fullPage: true, dim: 0, blur: 0 } },
  { name: 'Editorial', patch: { accent: '#f43f5e', cardStyle: 'solid', radius: 'sharp', font: 'serif', backgroundMode: 'photo', photo: 'backgrounds/foggy-valley.jpg', fullPage: false } },
]

const STORAGE_KEY = 'bettergarmin:appearance'
const CUSTOM_PHOTO_KEY = 'bettergarmin:customBackground'

/** Keeps saved layouts valid as widgets are added or removed in later versions. */
function normalizeLayout(layout: WidgetSlot[] | undefined): WidgetSlot[] {
  const known = new Set<string>(TODAY_WIDGETS.map((w) => w.id))
  const kept = (layout ?? []).filter((s) => known.has(s.id))
  const seen = new Set(kept.map((s) => s.id))
  return [...kept, ...TODAY_WIDGETS.filter((w) => !seen.has(w.id)).map((w) => ({ id: w.id, visible: true }))]
}

function load(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Appearance>
      return { ...DEFAULT_APPEARANCE, ...parsed, todayLayout: normalizeLayout(parsed.todayLayout) }
    }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_APPEARANCE
}

function loadCustomPhoto(): string | null {
  try {
    return localStorage.getItem(CUSTOM_PHOTO_KEY)
  } catch {
    return null
  }
}

let state = load()
let customPhoto = loadCustomPhoto()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function updateAppearance(patch: Partial<Appearance>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // per-browser convenience; fine to lose
  }
  emit()
}

export function resetAppearance() {
  updateAppearance({ ...DEFAULT_APPEARANCE, todayLayout: normalizeLayout(undefined) })
}

/** Stores a user photo, downscaled so it fits comfortably in browser storage. */
export async function setCustomPhoto(file: File): Promise<void> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("Couldn't read that image."))
      el.src = url
    })
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    try {
      localStorage.setItem(CUSTOM_PHOTO_KEY, dataUrl)
    } catch {
      throw new Error('That image is too large to save. Try a smaller one.')
    }
    customPhoto = dataUrl
    updateAppearance({ backgroundMode: 'custom' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Liquid glass is only visible over something, so it always puts the background behind every screen. */
export function usesFullBackdrop(a: Appearance): boolean {
  return a.fullPage || a.cardStyle === 'liquid'
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => state)
}

export function useCustomPhoto(): string | null {
  return useSyncExternalStore(subscribe, () => customPhoto)
}

const FONT_STACKS: Record<FontChoice, string> = {
  manrope: '"Manrope", ui-sans-serif, system-ui, -apple-system, sans-serif',
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}
const RADII: Record<Radius, { card: string; control: string }> = {
  sharp: { card: '6px', control: '6px' },
  rounded: { card: '14px', control: '10px' },
  round: { card: '24px', control: '16px' },
}
const ROOT_FONT_SIZE: Record<Density, string> = { compact: '14.5px', comfortable: '16px', spacious: '17px' }

/** Applies the style settings to the document as CSS variables and data attributes. Mount once. */
export function useApplyAppearance() {
  const a = useAppearance()
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent', a.accent)
    root.style.setProperty('--font-app', FONT_STACKS[a.font])
    root.style.setProperty('--radius-card', RADII[a.radius].card)
    root.style.setProperty('--radius-control', RADII[a.radius].control)
    root.style.fontSize = ROOT_FONT_SIZE[a.density]
    root.dataset.card = a.cardStyle
    root.dataset.glass = a.glassTint
    root.dataset.fullBackdrop = usesFullBackdrop(a) ? 'on' : 'off'
  }, [a])
}
