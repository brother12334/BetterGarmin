import { motion } from 'framer-motion'
import { cn } from '../lib/cn'
import { TABS } from './navConfig'

interface Props {
  active: number
  onSelect: (index: number) => void
  /** A unique id so several bars can animate independently. */
  layoutKey: string
}

const spring = { type: 'spring', stiffness: 420, damping: 34 } as const

/** The phone tab bar: a black sign band; the current tab sits on a white plate. Pure presentation: the caller decides what is active and what a tap does. */
export function NavBar({ active, onSelect, layoutKey }: Props) {
  return (
    <div className="flex h-[64px] w-full max-w-md items-center gap-1 rounded-control bg-[var(--band)] p-1.5 shadow-float">
      {TABS.map((t, i) => {
        const on = i === active
        const C = t.icon
        return (
          <button
            key={t.to}
            type="button"
            aria-label={t.label}
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(i)}
            className="relative flex h-full min-w-0 flex-1 items-center justify-center"
          >
            {on && (
              <motion.span
                layoutId={`${layoutKey}-gv`}
                transition={spring}
                className="absolute inset-0 rounded-[4px] bg-[var(--band-text)]"
              />
            )}
            <C width={27} height={27} className={cn('relative z-10 transition-colors duration-200', on ? 'text-[var(--band)]' : 'text-white/75')} />
          </button>
        )
      })}
    </div>
  )
}
