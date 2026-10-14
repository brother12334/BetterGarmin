import { useId, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { METRIC_COLORS, type MetricKey } from './metricColors'
import { cn } from '../../lib/cn'

interface RingProps {
  /** 0-100. Undefined/null renders an empty "no data" track. */
  value: number | null | undefined
  metric: MetricKey
  size?: number
  strokeWidth?: number
  label?: string
  sublabel?: string
  className?: string
}

export function Ring({ value, metric, size = 140, strokeWidth = 12, label, sublabel, className }: RingProps) {
  const gradientId = useId()
  const reduceMotion = useReducedMotion()
  const color = METRIC_COLORS[metric]

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = value == null ? 0 : Math.max(0, Math.min(100, value))
  const dashOffset = useMemo(() => circumference * (1 - clamped / 100), [circumference, clamped])

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ? `${label}: ${value == null ? 'no data' : Math.round(value)} of 100` : undefined}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color.gradient[0]} />
            <stop offset="100%" stopColor={color.gradient[1]} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={strokeWidth}
        />
        {value != null && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference, filter: `drop-shadow(0 0 0 ${color.solid}00)` }}
            animate={{
              strokeDashoffset: dashOffset,
              filter: `drop-shadow(0 0 6px ${color.solid}66)`,
            }}
            transition={reduceMotion ? { duration: 0 } : { duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label && <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>}
        <span className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">
          {value == null ? '—' : Math.round(value)}
        </span>
        {sublabel && <span className="text-[11px] text-[var(--text-tertiary)]">{sublabel}</span>}
      </div>
    </div>
  )
}
