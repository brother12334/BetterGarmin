import { cn } from '../../lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-[var(--bg-panel)]', className)}
      style={{ border: '1px solid var(--border-panel)' }}
    />
  )
}
