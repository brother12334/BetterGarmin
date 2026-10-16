import { NavLink, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '../lib/cn'
import { PageBackdrop } from '../components/ui/MountainBackdrop'
import { HealthIcon, InsightsIcon, Logo, MoreIcon, SleepIcon, TodayIcon, TrainingIcon } from './icons'

const TABS = [
  { to: '/', label: 'Today', icon: TodayIcon },
  { to: '/health', label: 'Health', icon: HealthIcon },
  { to: '/training', label: 'Training', icon: TrainingIcon },
  { to: '/sleep', label: 'Sleep', icon: SleepIcon },
  { to: '/insights', label: 'Insights', icon: InsightsIcon },
  { to: '/more', label: 'More', icon: MoreIcon },
]

export function AppShell() {
  return (
    <div className="flex min-h-screen w-full">
      <PageBackdrop />
      <aside className="sticky top-0 hidden h-screen w-56 flex-col gap-1 border-r border-[var(--border-panel)] p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Logo size={32} className="rounded-xl" />
          <span className="text-lg font-bold">BetterGarmin</span>
        </div>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )
            }
          >
            <tab.icon width={19} height={19} />
            {tab.label}
          </NavLink>
        ))}
      </aside>

      <div className="flex min-h-screen w-full flex-1 flex-col pb-20 md:pb-0">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-6 md:px-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-[var(--border-panel)] bg-[var(--bg-elevated)]/90 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)]"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="tab-highlight"
                    className="absolute inset-x-3 top-1 h-8 rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <tab.icon
                  width={21}
                  height={21}
                  className={cn('relative z-10 transition-colors', isActive ? 'text-[var(--accent)]' : undefined)}
                />
                <span className={cn('relative z-10 transition-colors', isActive ? 'text-[var(--text-primary)]' : undefined)}>
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
