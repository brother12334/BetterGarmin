import { cn } from '../../lib/cn'

/** Inline loading indicator; inherits the text colour. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}
