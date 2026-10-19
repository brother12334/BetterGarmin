import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useTheme } from '../../app/theme'
import { useUnits } from '../../app/units'
import { BackupCard } from './BackupCard'
import { RemindersCard } from './RemindersCard'
import { BandCard } from '../band/BandCard'
import { setClockFormat, useClockFormat } from '../../lib/clock'
import { fullscreenSupported, setFullscreenPref, useFullscreenPref } from '../../lib/fullscreen'
import { useData } from '../../app/DataProvider'
import { CustomizeIcon, SunIcon, MoonIcon } from '../../app/icons'
import { CloudConnectForm } from '../onboarding/CloudConnectForm'
import { CloudSetupWizard } from '../onboarding/CloudSetupWizard'
import { formatRelativeTime } from '../../lib/relativeTime'
import { GoalsCard } from './GoalsCard'
import { QuickExport } from './QuickExport'
import { SqlConsole } from './SqlConsole'

export function MorePage() {
  const { theme, setTheme } = useTheme()
  const { units, setUnits } = useUnits()
  const clock = useClockFormat()
  const fullscreen = useFullscreenPref()
  const { source, loadedKinds, forgetData, cloudConfigured, cloudStatus, cloudError, lastSynced, disconnectCloud, pullFromGarmin, garminPull } = useData()
  const [confirming, setConfirming] = useState(false)
  const [showConnectForm, setShowConnectForm] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">More</h1>

      <Link to="/customize">
        <Card className="flex items-center gap-4 border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]">
            <CustomizeIcon width={22} height={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Customize</p>
            <p className="text-xs text-[var(--text-tertiary)]">Backgrounds, widget layout, colours, fonts and themes</p>
          </div>
          <span className="shrink-0 text-[var(--text-tertiary)]">→</span>
        </Card>
      </Link>

      <Card>
        <p className="mb-3 font-semibold">Appearance</p>
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <Button key={t} variant={theme === t ? 'primary' : 'secondary'} onClick={() => setTheme(t)} className="flex-1 capitalize">
              {t === 'light' && <SunIcon width={15} height={15} />}
              {t === 'dark' && <MoonIcon width={15} height={15} />}
              {t}
            </Button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Units</p>
        <div className="flex gap-2">
          {(['metric', 'imperial'] as const).map((u) => (
            <Button key={u} variant={units === u ? 'primary' : 'secondary'} onClick={() => setUnits(u)} className="flex-1 capitalize">
              {u === 'metric' ? 'Metric (km, kg)' : 'Imperial (mi, lb)'}
            </Button>
          ))}
        </div>
      </Card>

      {fullscreenSupported() && (
        <Card>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-semibold">Fullscreen</span>
              <span className="block text-xs text-[var(--text-tertiary)]">
                Hides the browser's toolbars. If they come back, tap anywhere to hide them again.
              </span>
            </span>
            <input type="checkbox" checked={fullscreen} onChange={(e) => setFullscreenPref(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
        </Card>
      )}

      <BandCard />

      <Card>
        <p className="mb-3 font-semibold">Clock</p>
        <div className="flex gap-2">
          {(['12h', '24h'] as const).map((c) => (
            <Button key={c} variant={clock === c ? 'primary' : 'secondary'} onClick={() => setClockFormat(c)} className="flex-1">
              {c === '12h' ? '12-hour (7:20 PM)' : '24-hour (19:20)'}
            </Button>
          ))}
        </div>
      </Card>

      {loadedKinds.length > 0 && (
        <Card>
          <p className="mb-3 font-semibold">Goals</p>
          <GoalsCard />
        </Card>
      )}

      <Card>
        <p className="mb-2 font-semibold">Your data</p>
        <p className="text-sm text-[var(--text-secondary)]">
          {source === 'demo'
            ? 'You are viewing demo data — nothing real is loaded.'
            : source === 'cloud'
              ? `Synced automatically — ${loadedKinds.length} database file${loadedKinds.length === 1 ? '' : 's'} from your cloud sync.`
              : `Loaded ${loadedKinds.length} database file${loadedKinds.length === 1 ? '' : 's'} from your device.`}
        </p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          {source === 'cloud'
            ? 'Cloud sync is on: your Garmin data passes through your own Cloudflare Worker, protected by your access token. See the Cloud sync section below.'
            : 'Everything is processed locally in your browser and cached on this device only. Nothing is ever uploaded.'}
        </p>
        <div className="mt-4">
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="border-rose-500/40 text-rose-400"
                onClick={async () => {
                  await forgetData()
                  setConfirming(false)
                }}
              >
                Yes, forget everything
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Forget my data
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <p className="mb-1 font-semibold">Cloud sync (backup)</p>
        <p className="mb-3 text-xs text-[var(--text-tertiary)]">
          Optional backup. Sync now pulls straight from your band over Bluetooth first; the cloud copy is only used when the band can't be reached. Keeps data current via a scheduled sync you host yourself — no manual file drops. Requires a one-time setup with your own
          free Cloudflare account; see <code>docs/cloud-sync.md</code> for the full walkthrough and what it changes about privacy.
        </p>

        {cloudConfigured ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">
                Status: {cloudStatus === 'syncing' ? 'Syncing…' : cloudStatus === 'error' ? 'Error' : 'Connected'}
              </span>
              <span className="text-[var(--text-tertiary)]">Last synced {formatRelativeTime(lastSynced)}</span>
            </div>
            {cloudError && <p className="text-sm text-rose-400">{cloudError}</p>}
            {garminPull.status === 'running' && <p className="text-sm text-[var(--text-secondary)]">{garminPull.via === 'band' ? 'Syncing from your band…' : garminPull.afterBand ? 'Band synced · now updating the Garmin cloud backup (about 2 minutes)' : 'Downloading from Garmin… usually about 2 minutes.'}</p>}
            {garminPull.status === 'idle' && garminPull.note && <p className="text-sm text-[var(--text-secondary)]">{garminPull.note}</p>}
            {garminPull.status === 'error' && <p className="text-sm text-rose-400">{garminPull.message}</p>}
            <div className="flex gap-2">
              <Button loading={garminPull.status === 'running'} variant="secondary" onClick={() => pullFromGarmin()} disabled={cloudStatus === 'syncing' || garminPull.status === 'running'}>
                {garminPull.status === 'running' ? 'Syncing…' : 'Sync now'}
              </Button>
              <Button variant="ghost" onClick={disconnectCloud}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : showConnectForm ? (
          <div className="flex flex-col gap-3">
            <CloudSetupWizard onDone={() => setShowConnectForm(false)} />
            <p className="text-xs text-[var(--text-tertiary)]">Already have a Worker?</p>
            <CloudConnectForm onConnected={() => setShowConnectForm(false)} />
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setShowConnectForm(true)}>
            Set up automatic sync
          </Button>
        )}
      </Card>

      <Card>
        <p className="mb-2 font-semibold">Export data</p>
        <p className="mb-3 text-xs text-[var(--text-tertiary)]">Download your history as CSV files you can open in a spreadsheet.</p>
        <QuickExport />
      </Card>

      <BackupCard />
      <RemindersCard />

      <Card>
        <p className="mb-1 font-semibold">SQL console</p>
        <SqlConsole />
      </Card>

      <Card>
        <p className="mb-2 font-semibold">About</p>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          BetterGarmin is an independent, open-source project and is not affiliated with Garmin. It is not medical advice. It's built on top of the open-source{' '}
          <a href="https://github.com/tcgoetz/GarminDB" target="_blank" rel="noreferrer" className="underline">
            GarminDB
          </a>{' '}
          project (GPL-2.0).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="rounded-control border border-[var(--border-panel)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-panel)]" href="https://github.com/brother12334/BetterGarmin" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
          <a className="rounded-control border border-[var(--border-panel)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-panel)]" href="https://github.com/brother12334/BetterGarmin#readme" target="_blank" rel="noreferrer">
            Setup guide
          </a>
          <a className="rounded-control border border-[var(--border-panel)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-panel)]" href="https://github.com/brother12334/BetterGarmin/issues" target="_blank" rel="noreferrer">
            Report a problem
          </a>
        </div>
      </Card>

      <p className="text-center text-xs tabular-nums text-[var(--text-tertiary)]">
        BetterGarmin v{__APP_VERSION__} · build {__APP_COMMIT__} · {new Date(__APP_BUILD_DATE__).toLocaleDateString(undefined, { dateStyle: 'medium' })}
      </p>
    </div>
  )
}
