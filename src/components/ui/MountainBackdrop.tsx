import { useId, useMemo } from 'react'
import { generateTodayBackdrop } from '../../lib/dailyBackdrop'

const STAR_POSITIONS: [number, number, number][] = [
  [40, 30, 1.1],
  [90, 55, 0.8],
  [140, 25, 1],
  [200, 45, 0.7],
  [250, 20, 1.2],
  [300, 60, 0.9],
  [370, 35, 1],
  [20, 70, 0.6],
  [160, 70, 0.6],
]

const WIDTH = 420

interface MountainBackdropProps {
  height?: number
  className?: string
}

/** A mountain scene generated fresh for today — a new silhouette every calendar day, no photo/network dependency. */
export function MountainBackdrop({ height = 220, className }: MountainBackdropProps) {
  const { theme, ridges } = useMemo(() => generateTodayBackdrop(WIDTH, height), [height])
  const uid = useId()
  const skyId = `sky-${uid}`
  const sunId = `sun-${uid}`

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="xMidYMax slice"
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
      role="img"
      aria-label={`${theme.name} mountain backdrop`}
    >
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={theme.sky[0]} />
          <stop offset="100%" stopColor={theme.sky[1]} />
        </linearGradient>
        <radialGradient id={sunId}>
          <stop offset="0%" stopColor={theme.accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={theme.accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={WIDTH} height={height} fill={`url(#${skyId})`} />
      {theme.showStars &&
        STAR_POSITIONS.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.7} />)}
      <circle cx={WIDTH * 0.76} cy={height * 0.3} r={height * 0.4} fill={`url(#${sunId})`} />
      <circle cx={WIDTH * 0.76} cy={height * 0.3} r={height * 0.075} fill={theme.accent} opacity={0.95} />
      {ridges.map((d, i) => (
        <path key={i} d={d} fill={theme.mountains[i]} />
      ))}
    </svg>
  )
}
