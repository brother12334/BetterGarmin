import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useTheme } from '../../app/theme'
import { useData } from '../../app/DataProvider'
import { SunIcon, MoonIcon } from '../../app/icons'
import { CloudConnectForm } from '../onboarding/CloudConnectForm'
import { formatRelativeTime } from '../../lib/relativeTime'

export function MorePage() {
  const { theme, setTheme } = useTheme()
  const { source, loadedKinds, forgetData, cloudConfigured, cloudStatus, cloudError, lastSynced, disconnectCloud, syncNow } =
    useData()
  const [confirming, setConfirming] = useState(false)
  const [showConnectForm, setShowConnectForm] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">More</h1>

      <Card>
        <p className="mb-3 font-semibold">Appearance</p>
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <Button
              key={t}
              variant={theme === t ? 'primary' : 'secondary'}
              onClick={() => setTheme(t)}
              className="flex-1 capitalize"
            >
              {t === 'light' && <SunIcon width={15} height={15} />}
              {t === 'dark' && <MoonIcon width={15} height={15} />}
              {t}
            </Button>
          ))}
        </div>
      </Card>

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
        <p className="mb-1 font-semibold">Cloud sync</p>
        <p className="mb-3 text-xs text-[var(--text-tertiary)]">
          Optional. Keeps your data current automatically via a scheduled sync you host yourself — no manual file
          drops. Requires a one-time setup with your own free Cloudflare account; see{' '}
          <code>docs/cloud-sync.md</code> for the full walkthrough and what it changes about privacy.
        </p>

        {cloudConfigured ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">
                Status:{' '}
                {cloudStatus === 'syncing' ? 'Syncing…' : cloudStatus === 'error' ? 'Error' : 'Connected'}
              </span>
              <span className="text-[var(--text-tertiary)]">Last synced {formatRelativeTime(lastSynced)}</span>
            </div>
            {cloudError && <p className="text-sm text-rose-400">{cloudError}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => syncNow()} disabled={cloudStatus === 'syncing'}>
                Sync now
              </Button>
              <Button variant="ghost" onClick={disconnectCloud}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : showConnectForm ? (
          <CloudConnectForm onConnected={() => setShowConnectForm(false)} />
        ) : (
          <Button variant="secondary" onClick={() => setShowConnectForm(true)}>
            Set up automatic sync
          </Button>
        )}
      </Card>

      <Card>
        <p className="mb-2 font-semibold">About</p>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          BetterGarmin is an independent, open-source project and is not affiliated with Garmin. It is not medical
          advice. It's built on top of the open-source{' '}
          <a href="https://github.com/tcgoetz/GarminDB" target="_blank" rel="noreferrer" className="underline">
            GarminDB
          </a>{' '}
          project (GPL-2.0).
        </p>
      </Card>

      <p className="text-center text-xs text-[var(--text-tertiary)]">
        Goals, custom dashboards, unit toggle, SQL console, and export tools are coming in a later update.
      </p>
    </div>
  )
}
