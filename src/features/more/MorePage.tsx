import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { METRIC_COLORS, type MetricKey } from '../../components/ui/metricColors'
import { Hl } from '../../components/charts/HealthCharts'
import { useTheme } from '../../app/theme'
import { useUnits } from '../../app/units'
import { BackupCard } from './BackupCard'
import { RemindersCard } from './RemindersCard'
import { BandCard } from '../band/BandCard'
import { setClockFormat, useClockFormat } from '../../lib/clock'
import { fullscreenSupported, setFullscreenPref, useFullscreenPref } from '../../lib/fullscreen'
import { useData } from '../../app/DataProvider'
import { CloudConnectForm } from '../onboarding/CloudConnectForm'
import { CloudSetupWizard } from '../onboarding/CloudSetupWizard'
import { formatRelativeTime } from '../../lib/relativeTime'
import { GoalsCard } from './GoalsCard'
import { QuickExport } from './QuickExport'
import { SqlConsole } from './SqlConsole'
import { setSyncSource, useSyncSource } from '../../lib/syncSource'
import { cn } from '../../lib/cn'

/** A colour block for a section, in a metric's colours or a given pair. */
function Block({ metric, colors, className, children }: { metric?: MetricKey; colors?: [string, string]; className?: string; children: ReactNode }) {
  const [block, ink] = colors ?? [METRIC_COLORS[metric ?? 'neutral'].block, METRIC_COLORS[metric ?? 'neutral'].blockInk]
  return (
    <section className={cn('metric-block p-5', className)} style={{ ['--block' as string]: block, ['--block-ink' as string]: ink }}>
      {children}
    </section>
  )
}

/** A row of pill choices; the chosen one is an ink pill. */
function Pills<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors',
            value === v ? 'bg-[var(--block-ink)] text-[var(--block)]' : 'bg-[var(--bg-panel)] text-[var(--text-primary)]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** One setting in its own block: a heavy title, an optional note, the choices under it. */
function Setting({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-extrabold">{title}</h3>
        {note && <p className="text-xs font-semibold opacity-70">{note}</p>}
      </div>
      {children}
    </div>
  )
}

/** A fold-out row for tools that are used now and then. */
function Fold({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <details className="group border-t border-[var(--border-panel)] py-4 first:border-t-0 first:pt-0 last:pb-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className="block text-lg font-extrabold">{title}</span>
          {note && <span className="block text-xs font-semibold opacity-70">{note}</span>}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" className="shrink-0 transition-transform group-open:rotate-45" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-4 px-1 text-[1.5rem] font-extrabold tracking-tight">{children}</h2>
}

export function MorePage() {
  const { theme, setTheme } = useTheme()
  const { units, setUnits } = useUnits()
  const syncSource = useSyncSource()
  const clock = useClockFormat()
  const fullscreen = useFullscreenPref()
  const { source, loadedKinds, forgetData, cloudConfigured, cloudStatus, cloudError, lastSynced, disconnectCloud, pullFromGarmin, garminPull } = useData()
  const [confirming, setConfirming] = useState(false)
  const [showConnectForm, setShowConnectForm] = useState(false)
  const running = garminPull.status === 'running'
  const syncProblem = cloudConfigured && (cloudStatus === 'error' || garminPull.status === 'error')

  return (
    <div className="flex flex-col gap-2.5">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="page-title">More</h1>
        {/* Kept up here on purpose: the owner checks this to confirm an update has loaded. */}
        <span className="rounded-full bg-[var(--text-primary)] px-2.5 py-1 text-xs font-bold text-[var(--bg-base)]">v{__APP_VERSION__}</span>
      </div>

      {/* Sync status leads: lime when the cloud copy is working, coral when it needs attention or isn't set up. */}
      <Block metric={cloudConfigured && !syncProblem ? 'sleep' : 'stress'}>
        <h2 className="text-lg font-extrabold">Cloud sync</h2>
        {cloudConfigured ? (
          <>
            <p className="mt-1 text-[1.75rem] font-extrabold leading-tight tracking-tight">
              {running ? 'Syncing now…' : syncProblem ? 'Sync needs a look.' : <>Synced <Hl>{formatRelativeTime(lastSynced)}</Hl>.</>}
            </p>
            <p className="mt-1 text-sm font-semibold opacity-80">Every 15 minutes from Garmin's cloud, even while the app is closed.</p>
            {cloudError && <p className="mt-2 text-sm font-bold">{cloudError}</p>}
            {garminPull.status === 'idle' && garminPull.note && <p className="mt-2 text-sm font-semibold">{garminPull.note}</p>}
            {garminPull.status === 'error' && <p className="mt-2 text-sm font-bold">{garminPull.message}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => pullFromGarmin()}
                disabled={cloudStatus === 'syncing' || running}
                className="rounded-full bg-[var(--block-ink)] px-5 py-2.5 text-sm font-bold text-[var(--block)] disabled:opacity-60"
              >
                {running ? 'Syncing…' : 'Sync now'}
              </button>
              <button type="button" onClick={disconnectCloud} className="rounded-full bg-[var(--bg-panel)] px-5 py-2.5 text-sm font-bold">
                Disconnect
              </button>
            </div>
          </>
        ) : showConnectForm ? (
          <div className="mt-3 flex flex-col gap-3">
            <CloudSetupWizard onDone={() => setShowConnectForm(false)} />
            <p className="text-xs font-semibold">Already have a Worker?</p>
            <CloudConnectForm onConnected={() => setShowConnectForm(false)} />
          </div>
        ) : (
          <>
            <p className="mt-1 text-[1.75rem] font-extrabold leading-tight tracking-tight">Not set up yet.</p>
            <p className="mt-1 text-sm font-semibold opacity-80">
              One-time setup with your own free Cloudflare account.{' '}
              <a href="https://github.com/brother12334/BetterGarmin/blob/main/docs/cloud-sync.md" target="_blank" rel="noreferrer" className="underline">
                How sync works
              </a>
            </p>
            <button type="button" onClick={() => setShowConnectForm(true)} className="mt-4 rounded-full bg-[var(--block-ink)] px-5 py-2.5 text-sm font-bold text-[var(--block)]">
              Set up automatic sync
            </button>
          </>
        )}
      </Block>

      <div className="grid grid-cols-2 gap-2.5">
        <Link to="/customize" className="block">
          <Block metric="energy" className="flex h-full min-h-36 flex-col justify-between">
            <h2 className="text-lg font-extrabold">Customize</h2>
            <p className="text-[1.75rem] font-extrabold leading-none tracking-tight">Make it yours →</p>
          </Block>
        </Link>
        <Block className="flex min-h-36 flex-col justify-between">
          <h2 className="text-lg font-extrabold">Your data</h2>
          <div>
            <p className="blk-num text-[2.75rem]">{source === 'demo' ? 'Demo' : loadedKinds.length}</p>
            <p className="text-sm font-semibold opacity-75">{source === 'demo' ? 'sample data, nothing real' : source === 'cloud' ? 'files from your cloud' : 'files on this device'}</p>
          </div>
        </Block>
      </div>

      {loadedKinds.length > 0 && (
        <Block>
          <h2 className="mb-3 text-lg font-extrabold">Goals</h2>
          <GoalsCard />
        </Block>
      )}

      <SectionTitle>Settings</SectionTitle>
      {/* Each setting is its own block (no long list with dividers); theme sits on black. */}
      <Block metric="energy">
        <Setting title="Theme">
          <Pills value={theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={setTheme} />
        </Setting>
      </Block>
      <Block>
        <Setting title="Units">
          <Pills value={units} options={[['metric', 'Metric · km, kg'], ['imperial', 'Imperial · mi, lb']]} onChange={setUnits} />
        </Setting>
      </Block>
      <Block>
        <Setting title="Clock">
          <Pills value={clock} options={[['12h', '12-hour · 7:20 PM'], ['24h', '24-hour · 19:20']]} onChange={setClockFormat} />
        </Setting>
      </Block>
      <Block>
        <Setting title="Sync source" note="The Garmin cloud copy is recommended; direct band sync needs Bluetooth and is unreliable on iPhone.">
          <Pills value={syncSource} options={[['cloud', 'Garmin cloud copy'], ['band', 'Band (Bluetooth)']]} onChange={setSyncSource} />
        </Setting>
      </Block>
      {fullscreenSupported() && (
        <Block>
          <Setting title="Fullscreen" note="Hides the browser's toolbars. If they come back, tap anywhere to hide them again.">
            <Pills value={fullscreen ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => setFullscreenPref(v === 'on')} />
          </Setting>
        </Block>
      )}

      <SectionTitle>Tools</SectionTitle>
      <Block>
        <div>
          <Fold title="Export CSV" note="Your history as spreadsheet files">
            <QuickExport />
          </Fold>
          <Fold title="Backup and restore" note="Everything on this phone, in one file">
            <BackupCard bare />
          </Fold>
          <Fold title="Workout reminder" note="Only while the app is open">
            <RemindersCard bare />
          </Fold>
          <Fold title="SQL console" note="Read-only queries on your GarminDB files">
            <SqlConsole />
          </Fold>
        </div>
      </Block>
      {/* Forgetting data is kept apart from routine tools, on coral. */}
      <Block metric="stress">
        <div>
          <Fold title="Forget my data" note="Removes everything this app stored on this phone">
            <p className="mb-3 text-sm font-semibold opacity-85">
              {source === 'cloud' ? 'Your cloud copy stays in your own Cloudflare storage; this only clears this phone.' : 'Everything is processed and cached on this device only.'}
            </p>
            {confirming ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await forgetData()
                    setConfirming(false)
                  }}
                  className="rounded-full bg-[var(--block-ink)] px-5 py-2.5 text-sm font-bold text-[var(--block)]"
                >
                  Yes, forget everything
                </button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="rounded-full bg-[var(--bg-panel)] px-5 py-2.5 text-sm font-bold">
                Forget my data
              </button>
            )}
          </Fold>
        </div>
      </Block>
      {/* Direct Bluetooth use of the band is obsolete for now (unreliable on iPhone); kept, folded away and quiet. */}
      <Block colors={['#ece8e1', '#121212']} className="py-4">
        <div>
          <Fold title="Bluetooth band tools" note="Obsolete for now: only for direct band sync in Bluefy">
            <BandCard bare />
          </Fold>
        </div>
      </Block>

      <Block colors={['#121212', '#f4f1ec']} className="mt-4">
        <h2 className="text-lg font-extrabold">About</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed opacity-85">
          BetterGarmin is an independent, open-source project and is not affiliated with Garmin. It is not medical advice. It's built on top of the open-source{' '}
          <a href="https://github.com/tcgoetz/GarminDB" target="_blank" rel="noreferrer" className="underline">
            GarminDB
          </a>{' '}
          project (GPL-2.0).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['Source on GitHub', 'https://github.com/brother12334/BetterGarmin'],
            ['Setup guide', 'https://github.com/brother12334/BetterGarmin#readme'],
            ['Report a problem', 'https://github.com/brother12334/BetterGarmin/issues'],
          ].map(([label, href]) => (
            <a key={href} href={href} target="_blank" rel="noreferrer" className="rounded-full bg-[var(--bg-panel)] px-4 py-2 text-sm font-bold">
              {label}
            </a>
          ))}
        </div>
        <p className="mt-4 text-sm font-bold tabular-nums">
          v{__APP_VERSION__} <span className="font-semibold opacity-60">· build {__APP_COMMIT__} · {new Date(__APP_BUILD_DATE__).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
        </p>
      </Block>
    </div>
  )
}
