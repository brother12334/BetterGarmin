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

/** The phone tab bar: a floating smoked-glass capsule. Pure presentation: the caller decides what is active and what a tap does. */
export function NavBar({ active, onSelect, layoutKey }: Props) {
  return (
    <div className="flex h-[76px] w-full max-w-md items-center gap-1 rounded-full border border-white/15 bg-black/35 p-2 shadow-float backdrop-blur-2xl">
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
                className="absolute inset-0 rounded-full border border-white/20 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
              />
            )}
            <C width={27} height={27} className={cn('relative z-10 transition-colors duration-200', on ? 'text-white' : 'text-white/70')} />
          </button>
        )
      })}
    </div>
  )
}
