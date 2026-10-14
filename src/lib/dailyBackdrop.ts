/** A small set of hand-tuned color stories, cycled by day of week, paired with a mountain silhouette generated fresh every calendar day. */
export interface BackdropTheme {
  name: string
  sky: [string, string]
  mountains: [string, string, string]
  accent: string
  showStars: boolean
}

const THEMES: BackdropTheme[] = [
  { name: 'Dawn', sky: ['#2b2650', '#e08a3e'], mountains: ['#1c1a38', '#262152', '#332c68'], accent: '#ffcf86', showStars: false },
  { name: 'Alpine', sky: ['#07313f', '#2fa8c9'], mountains: ['#04242f', '#083644', '#0d4757'], accent: '#bdeeff', showStars: false },
  { name: 'Dusk', sky: ['#1c1030', '#9a4f8f'], mountains: ['#160c26', '#241536', '#331f49'], accent: '#ff9ecb', showStars: true },
  { name: 'Midnight', sky: ['#050611', '#1c2250'], mountains: ['#030409', '#080a1a', '#0e1230'], accent: '#c7d2fe', showStars: true },
  { name: 'Glacier', sky: ['#132032', '#4f8fb0'], mountains: ['#0c1724', '#152b3a', '#1e3c52'], accent: '#e7f6ff', showStars: false },
  { name: 'Ember', sky: ['#2a0f0f', '#c9602e'], mountains: ['#1d0a0a', '#2c1210', '#3c1a16'], accent: '#ffb169', showStars: false },
  { name: 'Aurora', sky: ['#021412', '#0c3d33'], mountains: ['#010908', '#04120f', '#081d17'], accent: '#5ff0b7', showStars: true },
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Days since the Unix epoch, in the viewer's local calendar — stable all day, rolls over at local midnight. */
export function getDayIndex(): number {
  const now = new Date()
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor(localMidnight.getTime() / 86_400_000)
}

export function getTodayTheme(dayIndex = getDayIndex()): BackdropTheme {
  return THEMES[((dayIndex % THEMES.length) + THEMES.length) % THEMES.length]
}

/** A smooth jagged ridge line, closed down to the bottom of the viewBox, as an SVG path `d` string. */
export function ridgePath(rng: () => number, width: number, height: number, baseY: number, amplitude: number, points = 7): string {
  const step = width / (points - 1)
  const coords: [number, number][] = []
  for (let i = 0; i < points; i++) {
    const x = i * step
    const edgeDamp = i === 0 || i === points - 1 ? 0.35 : 1
    const y = baseY - rng() * amplitude * edgeDamp
    coords.push([x, Math.max(8, y)])
  }
  let d = `M 0 ${height} L ${coords[0][0]} ${coords[0][1]} `
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[i + 1]
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    d += `Q ${x1} ${y1} ${mx} ${my} `
  }
  const last = coords[coords.length - 1]
  d += `L ${width} ${last[1]} L ${width} ${height} Z`
  return d
}

export interface GeneratedBackdrop {
  theme: BackdropTheme
  ridges: string[]
}

/** Builds today's full backdrop: the weekly color theme plus a mountain silhouette unique to this calendar day. */
export function generateTodayBackdrop(width = 420, height = 220): GeneratedBackdrop {
  const dayIndex = getDayIndex()
  const theme = getTodayTheme(dayIndex)
  const rng = mulberry32(dayIndex * 2654435761)
  const baseYs = [height * 0.55, height * 0.68, height * 0.82]
  const amplitudes = [height * 0.32, height * 0.26, height * 0.22]
  const ridges = baseYs.map((baseY, i) => ridgePath(rng, width, height, baseY, amplitudes[i], 6 + i))
  return { theme, ridges }
}
