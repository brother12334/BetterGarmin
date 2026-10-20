import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { indexedDbBandStore, type BandFileRecord } from '../../lib/band/bandFileStore'
import { rawView } from '../../lib/band/rawDecode'
import { copyText, downloadBlob } from '../../lib/download'

const label = (r: BandFileRecord) => `${r.dataType ?? 'unknown type'} · ${r.size.toLocaleString()} bytes · synced ${new Date(r.syncedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`

/**
 * Research tool: raw contents of band files Garmin hasn't documented (the "KPI" file, FIT types 44, 72 and 74), so
 * their numbers can be matched against Garmin Connect. Shows health values, so it only opens on request.
 */
export function RawFilesPanel() {
  const [files, setFiles] = useState<BandFileRecord[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = async () => {
    const all = await indexedDbBandStore.all()
    setFiles(all.filter((r) => !r.activity && r.fileType !== 'workout').sort((a, b) => b.syncedAt - a.syncedAt))
  }

  const [status, setStatus] = useState<string | null>(null)
  const allText = () => (files ?? []).map((r) => `===== ${label(r)} =====\n${rawView(r.bytes)}`).join('\n\n')
  const exportAll = async () => {
    const how = await downloadBlob(`bettergarmin-band-raw-${new Date().toISOString().slice(0, 10)}.txt`, allText(), 'text/plain')
    setStatus(how === 'shared' ? 'Shared.' : how === 'cancelled' ? null : 'If nothing appeared, use Copy all instead.')
  }
  const copyAll = async () => setStatus((await copyText(allText())) ? 'Copied. Paste it into a message or note.' : "Couldn't copy. Open each file below and select the text.")

  return (
    <details className="rounded-control border border-[var(--border-panel)] p-3 text-sm" onToggle={(e) => (e.currentTarget.open && !files ? void load() : undefined)}>
      <summary className="cursor-pointer font-semibold">Decode undocumented band files</summary>
      <div className="mt-2 flex flex-col gap-3">
        <p className="text-[var(--text-secondary)]">
          Shows the raw numbers inside band files Garmin hasn't documented, so they can be matched with what Garmin Connect shows for the same day (steps,
          resting heart rate, stress, sleep). <b>This shows your health data.</b> It stays on this phone unless you share it.
        </p>
        {files == null ? (
          <p className="text-[var(--text-tertiary)]">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-[var(--text-tertiary)]">No undocumented files synced yet. Tap Sync first.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={copyAll}>
                Copy all
              </Button>
              <Button variant="secondary" onClick={exportAll}>
                Share as a file
              </Button>
            </div>
            {status && <p className="text-[var(--text-secondary)]" role="status">{status}</p>}
            {files.map((r) => (
              <div key={r.key} className="flex flex-col gap-1">
                <button type="button" className="min-h-11 text-left text-[var(--accent)]" onClick={() => setOpen(open === r.key ? null : r.key)}>
                  {open === r.key ? '▾' : '▸'} {label(r)}
                </button>
                {open === r.key && <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-control bg-black/30 p-2 font-mono text-[11px]">{rawView(r.bytes)}</pre>}
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  )
}
