import { useEffect } from 'react'
import { installAutoFullscreen } from '../lib/fullscreen'
import { useToolbarTint } from './toolbarTint'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { NavBar } from './NavBar'
import { TABS } from './navConfig'
import { cn } from '../lib/cn'
import { PageBackdrop } from '../components/ui/MountainBackdrop'
import { Logo } from './icons'


const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Today'],
  [/^\/health/, 'Health'],
  [/^\/training\/strength\/workout\/[^/]+\/review/, 'Review import'],
  [/^\/training\/strength\/workout/, 'Workout'],
  [/^\/training\/strength/, 'Strength'],
  [/^\/training/, 'Training'],
  [/^\/sleep/, 'Sleep'],
  [/^\/insights/, 'Insights'],
  [/^\/customize/, 'Customize'],
  [/^\/more/, 'More'],
]

/** Keeps the browser tab title in step with the current screen. */
function useDocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const name = TITLES.find(([re]) => re.test(pathname))?.[1]
    document.title = name ? `${name} · BetterGarmin` : 'BetterGarmin'
  }, [pathname])
}

export function AppShell() {
  useEffect(() => installAutoFullscreen(), [])
  useToolbarTint()
  useDocumentTitle()
  return (
    <div className="flex min-h-screen w-full">
      <PageBackdrop />
      <aside className="sticky top-0 hidden h-screen w-56 flex-col gap-1 border-r border-[var(--border-panel)] p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Logo size={32} className="rounded-control" />
          <span className="text-lg font-bold">BetterGarmin</span>
        </div>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-control px-3 py-3 text-sm font-medium transition-colors',
                isActive ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )
            }
          >
            <tab.icon width={19} height={19} />
            {tab.label}
          </NavLink>
        ))}
      </aside>

      <div className="flex min-h-screen w-full flex-1 flex-col pb-32 md:pb-0">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-[calc(1.5rem+env(safe-area-inset-top))] md:px-8">
          <Outlet />
        </main>
      </div>

      <PhoneNav />
    </div>
  )
}


function activeIndex(pathname: string): number {
  const i = TABS.findIndex((t) => (t.to === '/' ? pathname === '/' : pathname === t.to || pathname.startsWith(`${t.to}/`)))
  return i === -1 ? (pathname.startsWith('/customize') ? TABS.length - 1 : 0) : i
}

function PhoneNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] md:hidden">
      <NavBar active={activeIndex(pathname)} onSelect={(i) => navigate(TABS[i].to)} layoutKey="main" />
    </nav>
  )
}
