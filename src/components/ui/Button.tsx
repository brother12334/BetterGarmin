import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_60%,#4f46e5))] text-white shadow-lg shadow-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:brightness-110 active:scale-[0.98]',
  secondary:
    'bg-[var(--bg-panel)] border border-[var(--border-panel)] text-[var(--text-primary)] hover:bg-white/10 active:scale-[0.98]',
  ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:scale-[0.98]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  )
})
