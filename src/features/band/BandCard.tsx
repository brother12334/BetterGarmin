import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { BAND_CAPS, band, cancelBandAlert, listBandFiles, testBandAlert, useBand, type FileListing } from '../../lib/band/bandStore'

const STATE_TEXT: Record<string, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  registering: 'Registering…',
  handshaking: 'Handshaking…',
  ready: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection failed',
}

/** Direct Bluetooth connection to a Garmin CIRQA band: status, test alert, experimental file listing and a protocol log. */
export function BandCard() {
  const b = useBand()
  const [busy, setBusy] = useState(false)
  const [alertResult, setAlertResult] = useState<string | null>(null)
  const [listing, setListing] = useState<FileListing | null>(null)
  const [listError, setListError] = useState<string | null>(null)
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

  const list = async () => {
    setBusy(true)
    setListError(null)
    setListing(null)
    try {
      setListing(await listBandFiles())
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Garmin band (CIRQA) · experimental</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {STATE_TEXT[b.state]}
            {b.deviceName ? ` · ${b.deviceName}` : ''}
            {ready && b.protocolVersion != null ? ` · protocol ${b.protocolVersion}` : ''}
          </p>
        </div>
        {ready ? (
          <Button variant="ghost" onClick={() => band.disconnect()}>
            Disconnect
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => connect(false)} disabled={!supported || working}>
            {working ? STATE_TEXT[b.state] : 'Connect'}
          </Button>
        )}
      </div>

      {!supported && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Needs Web Bluetooth: Chrome or Edge, or Bluefy on iPhone.
        </p>
      )}

      {b.state === 'error' && b.error && (
        <div className="rounded-[var(--radius-control)] border border-amber-400/30 p-3 text-xs text-[var(--text-secondary)]">
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
          <div className="flex flex-wrap gap-2 text-[11px]">
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
          <p className="text-[11px] text-[var(--text-tertiary)]">
            Uses the band's Find My Watch alert. It isn't a custom vibration or an alarm.
          </p>

          <div className="border-t border-[var(--border-panel)] pt-3">
            <p className="text-sm font-semibold">Direct sync (experimental)</p>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              Lists the files on the band without changing anything. Downloading and importing them isn't available yet: the band's file-transfer
              channel hasn't been verified, so BetterGarmin won't try it.
            </p>
            <Button variant="secondary" className="mt-2" onClick={list} disabled={busy}>
              {busy ? 'Listing…' : 'List files on band'}
            </Button>
            {listError && <p className="mt-2 text-xs text-rose-400">{listError}</p>}
            {listing && (
              <div className="mt-2 text-xs text-[var(--text-secondary)]">
                <p>
                  {listing.total} file reference{listing.total === 1 ? '' : 's'} over {listing.pages.length} page{listing.pages.length === 1 ? '' : 's'}
                  {listing.complete ? '' : ' (stopped before the end)'}.
                  {listing.nextTransactionId != null ? ` Next transaction ID ${listing.nextTransactionId} saved.` : ''}
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[var(--text-tertiary)]">Raw response</summary>
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(listing, null, 1)}</pre>
                </details>
              </div>
            )}
          </div>
        </>
      )}

      <div className="border-t border-[var(--border-panel)] pt-2">
        <button className="text-xs text-[var(--text-tertiary)] underline" onClick={() => setShowLog((v) => !v)}>
          {showLog ? 'Hide' : 'Show'} protocol log ({b.log.length})
        </button>
        {showLog && (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px] text-[var(--text-secondary)]">
            {b.log.map((e) => `${new Date(e.t).toLocaleTimeString()} ${e.dir === 'out' ? '→' : e.dir === 'in' ? '←' : e.dir === 'error' ? '✕' : '·'} ${e.text}`).join('\n')}
          </pre>
        )}
      </div>
    </Card>
  )
}

function Cap({ on, label }: { on: boolean; label: string }) {
  return <span className={on ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400' : 'rounded-full bg-slate-500/20 px-2 py-0.5 text-[var(--text-tertiary)]'}>{on ? '✓' : '✕'} {label}</span>
}
