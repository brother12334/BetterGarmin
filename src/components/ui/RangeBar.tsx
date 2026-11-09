import { InfoButton } from './InfoButton'
import { STATUS_COLORS, STATUS_LABELS, type StatusLevel } from '../../lib/statusWords'

interface RangeBarProps {
  label: string
  value: number | null
  /** Overrides the plain rounded value, e.g. "7h 42m" instead of a bare number. */
  displayValue?: string
  min?: number
  max?: number
  status?: StatusLevel | null
  color: string
  infoTitle?: string
  infoDescription?: string
}

/** A signpost row: the metric in sign caps with its status word, the value set large on the right, and a straight
 * trail-marker track with quarter ticks below. */
export function RangeBar({ label, value, displayValue, min = 0, max = 100, status, color, infoTitle, infoDescription }: RangeBarProps) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))

  return (
    <div className="py-3">
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="sign-caps text-sm text-[var(--text-primary)]">{label}</span>
          {status && (
            <span className="text-xs font-bold" style={{ color: STATUS_COLORS[status] }}>
              {STATUS_LABELS[status]}
            </span>
          )}
          {infoTitle && infoDescription && <InfoButton title={infoTitle}>{infoDescription}</InfoButton>}
        </div>
        <span className="text-3xl font-extrabold leading-none text-[var(--text-primary)]">
          {displayValue ?? (value == null ? '—' : Math.round(value))}
        </span>
      </div>
      <div className="relative mt-3 h-2 w-full bg-[var(--ring-track)]">
        <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
        {[25, 50, 75].map((t) => (
          <span key={t} className="absolute top-0 h-full w-px bg-[var(--bg-panel)]" style={{ left: `${t}%` }} aria-hidden />
        ))}
      </div>
    </div>
  )
}
