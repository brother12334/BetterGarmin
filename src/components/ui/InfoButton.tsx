import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../lib/cn'

interface InfoButtonProps {
  title: string
  /** Plain-language explanation: what it means, why it matters, healthy range. */
  children: string
  className?: string
}

/** The small "i" affordance every metric card gets, explaining itself in plain language. */
export function InfoButton({ title, children, className }: InfoButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        type="button"
        aria-label={`About ${title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        // Takes its colour from the text around it, so it reads on white panels and on colour blocks alike.
        className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-semibold opacity-55 transition-opacity hover:opacity-100"
      >
        i
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              role="dialog"
              aria-label={title}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute left-1/2 top-7 z-50 w-64 -translate-x-1/2 rounded-control border border-[var(--border-panel)] bg-[var(--bg-elevated)] p-4 text-left shadow-float"
            >
              <p className="mb-1 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{children}</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
