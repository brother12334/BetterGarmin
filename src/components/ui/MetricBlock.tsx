import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { InfoButton } from './InfoButton'
import { METRIC_COLORS, type MetricKey } from './metricColors'

interface MetricBlockProps {
  metric: MetricKey
  label: string
  /** Already formatted: "67", "7h 49m", "13.2k". */
  value: string
  sub?: ReactNode
  info?: { title: string; text: string }
  /** Number size; the readiness block uses the largest. */
  size?: 'md' | 'lg' | 'xl'
  className?: string
  children?: ReactNode
}

const SIZES = { md: 'text-[3.5rem]', lg: 'text-[4.5rem]', xl: 'text-[8.25rem]' }

/** One measure as a full field of its colour with one giant number: the app's signature block. */
export function MetricBlock({ metric, label, value, sub, info, size = 'md', className, children }: MetricBlockProps) {
  const c = METRIC_COLORS[metric]
  return (
    <div className={cn('metric-block relative flex flex-col overflow-hidden p-4', className)} style={{ ['--block' as string]: c.block, ['--block-ink' as string]: c.blockInk }}>
      <div className="flex items-center gap-2">
        <span className="blk-label text-sm">{label}</span>
        {info && <InfoButton title={info.title}>{info.text}</InfoButton>}
      </div>
      <span className={cn('blk-num mt-2', SIZES[size])}>{value}</span>
      {sub && <span className="mt-1 text-[0.8125rem] font-semibold opacity-80">{sub}</span>}
      {children}
    </div>
  )
}
