import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useData } from '../../app/DataProvider'

export function CloudConnectForm({ onConnected }: { onConnected?: () => void }) {
  const { connectCloud } = useData()
  const [workerUrl, setWorkerUrl] = useState('')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    if (!workerUrl.trim() || !token.trim()) return
    setStatus('connecting')
    setError(null)
    const result = await connectCloud({ workerUrl: workerUrl.trim(), token: token.trim() })
    if (result.ok) {
      setStatus('idle')
      onConnected?.()
    } else {
      setStatus('error')
      setError(result.error ?? 'Could not connect.')
    }
  }

  return (
    <Card className="flex flex-col gap-3 text-left">
      <div>
        <label className="text-xs font-medium text-[var(--text-tertiary)]" htmlFor="worker-url">
          Worker URL
        </label>
        <input
          id="worker-url"
          type="url"
          placeholder="https://bettergarmin-sync.your-name.workers.dev"
          value={workerUrl}
          onChange={(e) => setWorkerUrl(e.target.value)}
          className="mt-1 w-full rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-sky-400"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-[var(--text-tertiary)]" htmlFor="access-token">
          Access token
        </label>
        <input
          id="access-token"
          type="password"
          placeholder="the token you set with wrangler secret put ACCESS_TOKEN"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="mt-1 w-full rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-sky-400"
        />
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <Button loading={status === 'connecting'} onClick={handleConnect} disabled={status === 'connecting' || !workerUrl.trim() || !token.trim()}>
        {status === 'connecting' ? 'Connecting…' : 'Connect'}
      </Button>
      <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
        This is a one-time setup for a separate, optional backend that syncs automatically — it requires a free
        Cloudflare account and storing your Garmin login as a GitHub secret. Full walkthrough in{' '}
        <code>docs/cloud-sync.md</code>. Skip this if you'd rather keep everything fully local.
      </p>
    </Card>
  )
}
