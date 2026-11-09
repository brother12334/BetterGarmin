import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

const TONES = {
  neutral: 'bg-[var(--bg-panel)] text-[var(--text-secondary)] border border-[var(--border-panel)]',
  accent: 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]',
  success: 'bg-[color-mix(in_srgb,var(--tone-green)_15%,transparent)] text-[var(--tone-green)]',
  warning: 'bg-[color-mix(in_srgb,var(--tone-amber)_15%,transparent)] text-[var(--tone-amber)]',
  danger: 'bg-[color-mix(in_srgb,var(--tone-red)_15%,transparent)] text-[var(--tone-red)]',
} as const

/** Small status label. The one pill style used across the app. */
export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold leading-none', TONES[tone], className)}>{children}</span>
}
