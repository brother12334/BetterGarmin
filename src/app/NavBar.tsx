import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/cn'
import { TABS } from './navConfig'

interface Props {
  active: number
  onSelect: (index: number) => void
  /** A unique id so several bars can animate independently. */
  layoutKey: string
}

const spring = { type: 'spring', stiffness: 420, damping: 36 } as const

/**
 * The phone tab bar: big word tabs on a dark bar docked to the bottom edge. It scrolls sideways when the words
 * don't fit, and the current tab sits in a violet bubble that slides between words.
 */
export function NavBar({ active, onSelect, layoutKey }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    refs.current[active]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [active])

  return (
    <div className="no-scrollbar flex w-full items-center gap-1 overflow-x-auto rounded-t-[28px] bg-[var(--band)] px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 shadow-float">
      {TABS.map((t, i) => {
        const on = i === active
        return (
          <button
            key={t.to}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(i)}
            className="relative shrink-0 rounded-full px-4 py-2"
          >
            {on && <motion.span layoutId={`${layoutKey}-tab`} transition={spring} className="absolute inset-0 rounded-full bg-[var(--accent)]" />}
            <span className={cn('relative z-10 text-[1.375rem] font-extrabold tracking-tight transition-colors duration-200', on ? 'text-white' : 'text-white/45')}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
