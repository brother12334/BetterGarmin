import { motion } from 'framer-motion'
import { cn } from '../lib/cn'
import type { NavStyle } from './appearance'
import { TABS } from './navConfig'

interface Props {
  variant: NavStyle
  active: number
  onSelect: (index: number) => void
  /** A unique id so several bars (e.g. previews) can animate independently. */
  layoutKey: string
}

function Icon({ i, className, size = 20 }: { i: number; className?: string; size?: number }) {
  const C = TABS[i].icon
  return <C width={size} height={size} className={cn('relative z-10 transition-colors duration-200', className)} />
}

const spring = { type: 'spring', stiffness: 420, damping: 34 } as const

/** Every tab bar style. Pure presentation: the caller decides what is active and what a tap does. */
export function NavBar({ variant, active, onSelect, layoutKey }: Props) {
  const item = (i: number, children: React.ReactNode, className?: string) => (
    <button
      key={TABS[i].to}
      type="button"
      aria-label={TABS[i].label}
      aria-current={i === active ? 'page' : undefined}
      onClick={() => onSelect(i)}
      className={cn('relative flex flex-1 items-center justify-center', className)}
    >
      {children}
    </button>
  )
  const on = (i: number) => i === active

  switch (variant) {
    case 'expand':
      return (
        <div className="flex h-14 items-center gap-0.5 rounded-full bg-[var(--nav-surface)] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          {TABS.map((t, i) =>
            item(
              i,
              <>
                {on(i) && <motion.span layoutId={`${layoutKey}-x`} transition={spring} className="absolute inset-0 rounded-full bg-[var(--accent)]" />}
                <span className={cn('relative z-10 flex items-center gap-1.5', on(i) ? 'px-3' : 'px-0')}>
                  <Icon i={i} className={on(i) ? 'text-black/80' : 'text-white/70'} />
                  {on(i) && <span className="text-xs font-semibold text-black/80">{t.label}</span>}
                </span>
              </>,
              cn('h-full flex-none', on(i) ? '' : 'w-9'),
            ),
          )}
        </div>
      )
    case 'dock':
      return (
        <div className="flex h-16 items-center gap-1 rounded-[22px] border border-white/10 bg-[color-mix(in_srgb,var(--nav-surface)_75%,transparent)] px-2 shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          {TABS.map((_, i) =>
            item(
              i,
              <>
                <motion.span animate={{ y: on(i) ? -3 : 0, scale: on(i) ? 1.12 : 1 }} transition={spring} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06]">
                  <Icon i={i} className={on(i) ? 'text-[var(--accent)]' : 'text-white/70'} />
                </motion.span>
                {on(i) && <motion.span layoutId={`${layoutKey}-d`} transition={spring} className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--accent)]" />}
              </>,
              'h-full',
            ),
          )}
        </div>
      )
    case 'classic':
      return (
        <div className="flex h-16 w-full items-stretch border-t border-[var(--border-panel)] bg-[var(--bg-elevated)]/90 backdrop-blur-lg">
          {TABS.map((t, i) =>
            item(
              i,
              <span className="flex flex-col items-center gap-0.5">
                {on(i) && <motion.span layoutId={`${layoutKey}-c`} transition={spring} className="absolute inset-x-2 top-1.5 h-8 rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]" />}
                <Icon i={i} className={on(i) ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'} />
                <span className={cn('relative z-10 text-[10px] font-medium', on(i) ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]')}>{t.label}</span>
              </span>,
            ),
          )}
        </div>
      )
    case 'bubbles':
      return (
        <div className="flex h-16 items-center gap-2">
          {TABS.map((_, i) =>
            item(
              i,
              <motion.span
                animate={{ scale: on(i) ? 1.15 : 1, y: on(i) ? -4 : 0 }}
                transition={spring}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.35)]',
                  on(i) ? 'bg-[var(--accent)]' : 'bg-[var(--nav-surface)]',
                )}
              >
                <Icon i={i} className={on(i) ? 'text-black/80' : 'text-white/70'} />
              </motion.span>,
              'flex-none',
            ),
          )}
        </div>
      )
    case 'notch':
      return (
        <div className="relative flex h-14 w-full items-center rounded-[20px] bg-[var(--nav-surface)] px-1 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          {TABS.map((_, i) =>
            item(
              i,
              on(i) ? (
                <motion.span layoutId={`${layoutKey}-n`} transition={spring} className="absolute -top-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] shadow-[0_0_0_5px_var(--bg-base),0_8px_18px_rgba(0,0,0,0.35)]">
                  <Icon i={i} className="text-black/80" />
                </motion.span>
              ) : (
                <Icon i={i} className="text-white/65" />
              ),
              'h-full',
            ),
          )}
        </div>
      )
    case 'line':
      return (
        <div className="flex h-14 w-full items-stretch border-t border-[var(--border-panel)] bg-[var(--bg-base)]/95 backdrop-blur-lg">
          {TABS.map((_, i) =>
            item(
              i,
              <>
                {on(i) && <motion.span layoutId={`${layoutKey}-l`} transition={spring} className="absolute inset-x-4 top-0 h-[3px] rounded-b-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />}
                <Icon i={i} className={on(i) ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'} />
              </>,
            ),
          )}
        </div>
      )
    case 'glass':
      return (
        <div className="flex h-14 items-center gap-1 rounded-full border border-white/25 bg-white/10 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-2xl backdrop-saturate-[1.8]">
          {TABS.map((_, i) =>
            item(
              i,
              <>
                {on(i) && (
                  <motion.span
                    layoutId={`${layoutKey}-g`}
                    transition={spring}
                    className="absolute inset-0 rounded-full border border-white/40 bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
                  />
                )}
                <Icon i={i} className={on(i) ? 'text-white' : 'text-white/70'} />
              </>,
              'h-full w-11 flex-none',
            ),
          )}
        </div>
      )
    case 'glassFrost':
    case 'glassSmoke':
    case 'glassTint':
    case 'glassThick':
    case 'glassDrop': {
      const shell = {
        glassFrost:
          'border-white/50 bg-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-3xl',
        glassSmoke:
          'border-white/15 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl',
        glassTint:
          'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-2xl backdrop-saturate-[1.8]',
        glassThick:
          'border-white/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.06)_55%,rgba(255,255,255,0.14))] shadow-[inset_0_2px_1px_rgba(255,255,255,0.7),inset_0_-3px_6px_rgba(0,0,0,0.25),inset_0_0_18px_rgba(255,255,255,0.12),0_14px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-[2]',
        glassDrop:
          'border-white/25 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-2xl backdrop-saturate-[1.8]',
      }[variant]
      const dark = variant === 'glassFrost'
      return (
        <div className={cn('flex h-[76px] w-full max-w-md items-center gap-1 rounded-full border p-2', shell)}>
          {TABS.map((_, i) =>
            item(
              i,
              <>
                {on(i) &&
                  (variant === 'glassDrop' ? (
                    <motion.span
                      layoutId={`${layoutKey}-gd`}
                      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                      className="absolute h-14 w-14 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.95),color-mix(in_srgb,var(--accent)_70%,transparent)_45%,color-mix(in_srgb,var(--accent)_90%,black)_100%)] shadow-[0_4px_12px_color-mix(in_srgb,var(--accent)_45%,transparent),inset_0_-2px_4px_rgba(0,0,0,0.25)]"
                    />
                  ) : (
                    <motion.span
                      layoutId={`${layoutKey}-gv`}
                      transition={spring}
                      className={cn(
                        'absolute inset-0 rounded-full border',
                        variant === 'glassFrost' && 'border-white/80 bg-white/70 shadow-[0_2px_8px_rgba(0,0,0,0.12)]',
                        variant === 'glassSmoke' && 'border-white/20 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]',
                        variant === 'glassTint' && 'border-white/40 bg-[color-mix(in_srgb,var(--accent)_55%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]',
                        variant === 'glassThick' &&
                          'border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0.15))] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_3px_10px_rgba(0,0,0,0.2)]',
                      )}
                    />
                  ))}
                <Icon
                  i={i}
                  size={27}
                  className={
                    dark
                      ? on(i) ? 'text-black/85' : 'text-black/55'
                      : variant === 'glassDrop' && on(i) ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]' : on(i) ? 'text-white' : 'text-white/70'
                  }
                />
              </>,
              'h-full min-w-0 flex-1',
            ),
          )}
        </div>
      )
    }
    case 'glassLabel':
      return (
        <div className="flex h-16 items-center gap-0 rounded-[26px] border border-white/25 bg-white/10 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-2xl backdrop-saturate-[1.8]">
          {TABS.map((t, i) =>
            item(
              i,
              <span className="flex flex-col items-center gap-0.5">
                {on(i) && <motion.span layoutId={`${layoutKey}-gl`} transition={spring} className="absolute inset-0 rounded-[20px] border border-white/40 bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]" />}
                <Icon i={i} className={on(i) ? 'text-white' : 'text-white/70'} />
                <span className={cn('relative z-10 text-[9px] font-semibold', on(i) ? 'text-white' : 'text-white/60')}>{t.label}</span>
              </span>,
              'h-full w-12 flex-none',
            ),
          )}
        </div>
      )
    case 'glassBubbles':
      return (
        <div className="flex h-16 items-center gap-1.5">
          {TABS.map((_, i) =>
            item(
              i,
              <motion.span
                animate={{ scale: on(i) ? 1.12 : 1, y: on(i) ? -3 : 0 }}
                transition={spring}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-2xl backdrop-saturate-[1.8]',
                  on(i)
                    ? 'border-white/50 bg-[color-mix(in_srgb,var(--accent)_45%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_16px_rgba(0,0,0,0.3)]'
                    : 'border-white/25 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_rgba(0,0,0,0.25)]',
                )}
              >
                <Icon i={i} className={on(i) ? 'text-white' : 'text-white/75'} />
              </motion.span>,
              'flex-none',
            ),
          )}
        </div>
      )
    case 'glassBar':
      return (
        <div className="flex h-16 w-full items-stretch border-t border-white/20 bg-white/[0.08] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-2xl backdrop-saturate-[1.8]">
          {TABS.map((_, i) =>
            item(
              i,
              <>
                {on(i) && <motion.span layoutId={`${layoutKey}-gb`} transition={spring} className="absolute inset-x-1 inset-y-2 rounded-2xl border border-white/30 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]" />}
                <Icon i={i} className={on(i) ? 'text-white' : 'text-white/65'} />
              </>,
            ),
          )}
        </div>
      )
    case 'center':
      return (
        <div className="relative flex h-14 w-full items-center rounded-[20px] bg-[var(--nav-surface)] px-1 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          {[1, 2].map((i) => item(i, <Icon i={i} className={on(i) ? 'text-[var(--accent)]' : 'text-white/65'} />, 'h-full'))}
          {item(
            0,
            <span
              className={cn(
                'absolute -top-6 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_0_0_5px_var(--bg-base),0_10px_22px_rgba(0,0,0,0.4)]',
                on(0) ? 'bg-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--accent)_35%,var(--nav-surface))]',
              )}
            >
              <Icon i={0} className={on(0) ? 'text-black/80' : 'text-white'} />
            </span>,
            'h-full',
          )}
          {[3, 4, 5].map((i) => item(i, <Icon i={i} className={on(i) ? 'text-[var(--accent)]' : 'text-white/65'} />, 'h-full'))}
        </div>
      )
    case 'minimal':
      return (
        <div className="flex h-14 w-full items-center">
          {TABS.map((_, i) =>
            item(
              i,
              <>
                {on(i) && <motion.span layoutId={`${layoutKey}-m`} transition={spring} className="absolute h-10 w-10 rounded-full bg-[var(--accent)] opacity-25 blur-md" />}
                <Icon i={i} className={on(i) ? 'text-[var(--accent)] drop-shadow-[0_0_8px_var(--accent)]' : 'text-[var(--text-tertiary)]'} />
              </>,
              'h-full',
            ),
          )}
        </div>
      )
    case 'pill':
    default:
      return (
        <div className="flex h-14 items-center gap-1 rounded-full bg-[var(--nav-surface)] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          {TABS.map((_, i) =>
            item(
              i,
              <>
                {on(i) && <motion.span layoutId={`${layoutKey}-p`} transition={spring} className="absolute inset-0 rounded-full bg-[var(--accent)]" />}
                <Icon i={i} className={on(i) ? 'text-black/80' : 'text-white/70'} />
              </>,
              'h-full w-11 flex-none',
            ),
          )}
        </div>
      )
  }
}

