import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useTheme } from '../../app/theme'
import { useData } from '../../app/DataProvider'
import { SunIcon, MoonIcon } from '../../app/icons'

export function MorePage() {
  const { theme, setTheme } = useTheme()
  const { source, loadedKinds, forgetData } = useData()
  const [confirming, setConfirming] = useState(false)

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
            : `Loaded ${loadedKinds.length} database file${loadedKinds.length === 1 ? '' : 's'} from your device.`}
        </p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Everything is processed locally in your browser and cached on this device only. Nothing is ever uploaded.
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
