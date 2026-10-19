import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

const TONES = {
  neutral: 'bg-[var(--bg-panel)] text-[var(--text-secondary)] border border-[var(--border-panel)]',
  accent: 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]',
  success: 'bg-emerald-500/15 text-emerald-500',
  warning: 'bg-amber-500/15 text-amber-500',
  danger: 'bg-rose-500/15 text-rose-500',
} as const

/** Small status label. The one pill style used across the app. */
export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold leading-none', TONES[tone], className)}>{children}</span>
}
