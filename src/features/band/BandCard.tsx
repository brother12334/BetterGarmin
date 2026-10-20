import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { BAND_CAPS, band, cancelBandAlert, testBandAlert, useBand } from '../../lib/band/bandStore'
import { copyText } from '../../lib/download'
import { BandSyncPanel } from './BandSyncPanel'
import { RawFilesPanel } from './RawFilesPanel'
import { BandTroubleshooting } from './BandTroubleshooting'
import { useLastBandSync } from './useLastBandSync'
import { formatRelativeTime } from '../../lib/relativeTime'

const STATE_TEXT: Record<string, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  registering: 'Connecting…',
  handshaking: 'Connecting…',
  ready: 'Connected',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
  error: 'Connection failed',
}

const STATE_DOT: Record<string, string> = {
  ready: 'bg-emerald-500',
  connecting: 'bg-amber-400 animate-pulse',
  registering: 'bg-amber-400 animate-pulse',
  handshaking: 'bg-amber-400 animate-pulse',
  reconnecting: 'bg-amber-400 animate-pulse',
  error: 'bg-rose-500',
}

/** Direct Bluetooth connection to a Garmin CIRQA band: status, test alert, experimental file listing and a protocol log. */
export function BandCard() {
  const b = useBand()
  const lastSync = useLastBandSync()
  const [alertResult, setAlertResult] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const supported = typeof navigator !== 'undefined' && !!navigator.bluetooth
  const ready = b.state === 'ready'
  const working = b.state === 'connecting' || b.state === 'registering' || b.state === 'handshaking'

  const connect = async (showAll: boolean) => {
    try {
      await band.connect({ showAll })
    } catch {
      // shown from b.error
    }
  }

  const alert = async () => {
    setAlertResult('Sending…')
    try {
      await testBandAlert()
      setAlertResult('The band accepted the alert (status OK). It should be buzzing; tap Stop alert to end it early.')
    } catch (e) {
      setAlertResult(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const stopAlert = async () => {
    try {
      const status = await cancelBandAlert()
      setAlertResult(`Stop sent (band status ${status === 100 ? 'OK' : status}). Whether it stops the buzzing early hasn't been verified.`)
    } catch (e) {
      setAlertResult(`Stop failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Garmin band (CIRQA)</p>
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" role="status" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${STATE_DOT[b.state] ?? 'bg-[var(--text-tertiary)]'}`} aria-hidden />
            {STATE_TEXT[b.state]}
            {b.deviceName ? ` · ${b.deviceName}` : ''}
            {ready && b.batteryPercent != null ? ` · battery ${b.batteryPercent}%` : ''}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">Last successful sync: {lastSync ? formatRelativeTime(new Date(lastSync)) : 'never'}</p>
        </div>
        {ready ? (
          <Button variant="ghost" onClick={() => band.disconnect()}>
            Disconnect
          </Button>
        ) : (
          <Button loading={working} variant="secondary" onClick={() => connect(false)} disabled={!supported || working}>
            {working ? STATE_TEXT[b.state] : 'Connect'}
          </Button>
        )}
      </div>

      {!supported && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Needs Web Bluetooth: Chrome or Edge, or Bluefy on iPhone.
        </p>
      )}

      {b.state === 'reconnecting' && (
        <p className="text-xs text-[var(--text-secondary)]">The band dropped out. Trying to reconnect on its own; keep it close to your phone.</p>
      )}
      {b.state === 'disconnected' && (
        <p className="text-xs text-[var(--text-secondary)]">Couldn't get back to the band. Tap Connect when it's nearby. Anything already downloaded is safe on this phone, and nothing on the band was deleted.</p>
      )}

      {b.state === 'error' && b.error && (
        <div className="rounded-control border border-amber-400/30 p-3 text-xs text-[var(--text-secondary)]">
          <p>
            Couldn't connect. The browser said: <code className="text-[var(--text-primary)]">{b.error.raw}</code>
          </p>
          <p className="mt-2">
            <b>Band missing from the list?</b> Garmin Connect may be holding it. On iPhone open Settings → Bluetooth → ⓘ next to <b>Garmin Device</b>, and
            under <b>Apps allowed to connect</b> turn <b>Connect</b> off. Then try again here. Turn it back on when you're done. Don't forget, unpair or
            reset the band for this.
          </p>
          <button className="mt-2 text-sky-400 underline" onClick={() => connect(true)}>
            Show all Bluetooth devices
          </button>
        </div>
      )}

      {ready && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <Cap on={b.configBits.includes(BAND_CAPS.FIND_MY_WATCH)} label="Alert" />
            <Cap on={b.configBits.includes(BAND_CAPS.FILE_ACCESS)} label="File access" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={alert}>
              Test band alert
            </Button>
            <Button variant="ghost" onClick={stopAlert}>
              Stop alert
            </Button>
          </div>
          {alertResult && <p className="text-xs text-[var(--text-secondary)]">{alertResult}</p>}
          <p className="text-xs text-[var(--text-tertiary)]">
            Uses the band's Find My Watch alert. It isn't a custom vibration or an alarm.
          </p>

        </>
      )}

      <BandSyncPanel ready={ready} />

      <RawFilesPanel />
      <BandTroubleshooting onShowAll={() => connect(true)} />

      <div className="border-t border-[var(--border-panel)] pt-2">
        <button className="text-xs text-[var(--text-tertiary)] underline" onClick={() => setShowLog((v) => !v)}>
          {showLog ? 'Hide' : 'Show'} protocol log ({b.log.length})
        </button>
        {showLog && (
          <button
            className="ml-3 text-xs text-[var(--accent)] underline"
            onClick={() => void copyText(b.log.map((e) => `${new Date(e.t).toLocaleTimeString()} ${e.dir === 'out' ? '→' : e.dir === 'in' ? '←' : e.dir === 'error' ? '✕' : '·'} ${e.text}`).join('\n'))}
          >
            Copy log
          </button>
        )}
        {showLog && (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-[var(--text-secondary)]">
            {b.log.map((e) => `${new Date(e.t).toLocaleTimeString()} ${e.dir === 'out' ? '→' : e.dir === 'in' ? '←' : e.dir === 'error' ? '✕' : '·'} ${e.text}`).join('\n')}
          </pre>
        )}
      </div>
    </Card>
  )
}

function Cap({ on, label }: { on: boolean; label: string }) {
  return (
    <Badge tone={on ? 'success' : 'neutral'}>
      <span className={on ? 'h-2 w-2 rounded-full bg-emerald-500' : 'h-2 w-2 rounded-full bg-[var(--text-tertiary)]'} />
      {label}
    </Badge>
  )
}
