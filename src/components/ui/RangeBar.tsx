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

/** A compact, Oura-style row: label + status word, a big number, and a horizontal filled track with a dot at the current value. */
export function RangeBar({ label, value, displayValue, min = 0, max = 100, status, color, infoTitle, infoDescription }: RangeBarProps) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))

  return (
    <div className="py-2.5">
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
          {status && (
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: STATUS_COLORS[status] }}>
              {STATUS_LABELS[status]}
            </span>
          )}
          {infoTitle && infoDescription && <InfoButton title={infoTitle}>{infoDescription}</InfoButton>}
        </div>
        <span className="text-xl font-bold tabular-nums text-[var(--text-primary)]">
          {displayValue ?? (value == null ? '—' : Math.round(value))}
        </span>
      </div>
      <div className="relative mt-2.5 h-1.5 w-full rounded-full bg-[var(--ring-track)]">
        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
        {value != null && (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[left] duration-700 ease-out"
            style={{ left: `${pct}%`, backgroundColor: color, borderColor: 'var(--bg-elevated)' }}
          />
        )}
      </div>
    </div>
  )
}
