import { NavLink, Outlet, useLocation } from 'react-router-dom'
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

      <div className="flex min-h-screen w-full flex-1 flex-col pb-28 md:pb-0">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-[calc(1.5rem+env(safe-area-inset-top))] md:px-8">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden">
        <BlobTabBar />
      </nav>
    </div>
  )
}

const SLOT = 52 // px per tab
const BLOB = 46 // diameter of each dark circle
const ACTIVE = 50 // diameter of the popped-out active circle

function activeIndex(pathname: string): number {
  const i = TABS.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname === t.to || pathname.startsWith(`${t.to}/`)))
  return i === -1 ? (pathname.startsWith('/customize') ? TABS.length - 1 : 0) : i
}

/**
 * A row of dark circles merged into one organic shape by an SVG "goo" filter, with the active tab as a
 * separate accent circle that pops out of the bar and slides between tabs.
 */
function BlobTabBar() {
  const { pathname } = useLocation()
  const active = activeIndex(pathname)
  const width = SLOT * TABS.length

  return (
    <div className="pointer-events-auto relative" style={{ width, height: SLOT + 8 }}>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="tab-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
        </filter>
      </svg>

      {/* The merged dark shape: one circle per inactive tab plus a thin connecting bar. */}
      <div className="absolute inset-0 drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-0" style={{ filter: 'url(#tab-goo)' }}>
          <div className="absolute rounded-full bg-[var(--nav-surface)]" style={{ left: SLOT / 2, right: SLOT / 2, top: '50%', height: 30, marginTop: -15 }} />
          {TABS.map((tab, i) => (
            <motion.div
              key={tab.to}
              className="absolute rounded-full bg-[var(--nav-surface)]"
              style={{ width: BLOB, height: BLOB, top: '50%', marginTop: -BLOB / 2, left: i * SLOT + (SLOT - BLOB) / 2 }}
              animate={{ scale: i === active ? 0.55 : 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            />
          ))}
        </div>
      </div>

      {/* The active tab: a separate bright circle with a ring of page colour, so it reads as popped out. */}
      <motion.div
        className="absolute rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_var(--bg-base),0_8px_20px_rgba(0,0,0,0.35)]"
        style={{ width: ACTIVE, height: ACTIVE, top: '50%', marginTop: -ACTIVE / 2 }}
        initial={false}
        animate={{ left: active * SLOT + (SLOT - ACTIVE) / 2 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      />

      <div className="absolute inset-0 flex">
        {TABS.map((tab, i) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            aria-label={tab.label}
            className="relative z-10 flex h-full items-center justify-center"
            style={{ width: SLOT }}
          >
            <tab.icon
              width={20}
              height={20}
              className={cn('transition-colors duration-200', i === active ? 'text-black/80' : 'text-white/75')}
            />
          </NavLink>
        ))}
      </div>
    </div>
  )
}
