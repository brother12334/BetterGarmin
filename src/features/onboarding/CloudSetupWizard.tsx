import { useEffect, useState, type ReactNode } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useData } from '../../app/DataProvider'
import { cn } from '../../lib/cn'
import { CopyField } from './CopyField'
import { SHORTCUT_NAME, setShortcutSync, useShortcutSync } from '../../lib/shortcutSync'
import workerCode from '../../../worker/dashboard-worker.js?raw'

/**
 * Guided cloud-sync setup: one small task per step, with direct links to the exact settings pages, copy
 * buttons for every value, a generated access token and the Worker code bundled in. Progress is remembered
 * in this browser so it can be finished across several sittings.
 */

interface WizardState {
  step: number
  owner: string
  repo: string
  accessToken: string
  workerUrl: string
  accountId: string
}

const STORAGE_KEY = 'bettergarmin:cloudWizard'
const UPSTREAM = 'https://github.com/brother12334/BetterGarmin'

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** When the app is served from <owner>.github.io/<repo>/, that is almost certainly the user's fork. */
function guessFork(): { owner: string; repo: string } {
  const m = /^([^.]+)\.github\.io$/.exec(window.location.hostname)
  const repo = window.location.pathname.split('/').filter(Boolean)[0] ?? 'BetterGarmin'
  return { owner: m?.[1] ?? '', repo }
}

function loadState(): WizardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as WizardState
  } catch {
    // start fresh
  }
  return { step: 0, ...guessFork(), accessToken: randomToken(), workerUrl: '', accountId: '' }
}

/** Accepts a bare ID, the dashboard URL, or the R2 endpoint, and returns the 32-hex account ID if present. */
function extractAccountId(input: string): string | null {
  const m = /[0-9a-f]{32}/i.exec(input.trim())
  return m ? m[0].toLowerCase() : null
}

const STEPS = ['Your copy', 'Storage', 'Worker', 'Storage keys', 'GitHub secrets', 'First sync', 'Connect', 'Sync now', 'Auto-sync']

export function CloudSetupWizard({ onDone }: { onDone?: () => void }) {
  const [s, setS] = useState<WizardState>(loadState)
  const update = (patch: Partial<WizardState>) => setS((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      // progress just won't be remembered
    }
  }, [s])

  const repoUrl = s.owner && s.repo ? `https://github.com/${s.owner}/${s.repo}` : null
  const accountId = extractAccountId(s.accountId)
  const cf = (path: string) => (accountId ? `https://dash.cloudflare.com/${accountId}/${path}` : `https://dash.cloudflare.com/?to=/:account/${path}`)
  const go = (step: number) => update({ step: Math.max(0, Math.min(STEPS.length - 1, step)) })

  const body = ((): ReactNode => {
    switch (s.step) {
      case 0:
        return (
          <>
            <P>Automatic sync runs on your own free GitHub account, so you need your own copy of BetterGarmin.</P>
            <Ext href={`${UPSTREAM}/fork`}>1. Fork BetterGarmin on GitHub</Ext>
            <P>
              Then in your fork, open the <b>Actions</b> tab and click <b>enable workflows</b>. Enter your fork below
              so the next steps can link straight to the right pages.
            </P>
            <div className="grid grid-cols-2 gap-2">
              <Input label="GitHub username" value={s.owner} onChange={(owner) => update({ owner: owner.trim() })} placeholder="your-name" />
              <Input label="Repo name" value={s.repo} onChange={(repo) => update({ repo: repo.trim() })} placeholder="BetterGarmin" />
            </div>
            {repoUrl && <Ext href={`${repoUrl}/actions`}>Open your fork's Actions tab</Ext>}
          </>
        )
      case 1:
        return (
          <>
            <P>Your synced files are stored in Cloudflare R2. The free tier is plenty.</P>
            <Ext href="https://dash.cloudflare.com/sign-up">Create a Cloudflare account (skip if you have one)</Ext>
            <Input
              label="Cloudflare account ID: paste your dashboard address or the ID"
              value={s.accountId}
              onChange={(accountId) => update({ accountId })}
              placeholder="https://dash.cloudflare.com/…"
              status={s.accountId ? (accountId ? 'ok' : 'bad') : undefined}
              hint={s.accountId && !accountId ? "That doesn't contain a 32-character account ID yet." : undefined}
            />
            <Ext href={cf('r2/new')}>Create an R2 bucket</Ext>
            <P>Name it exactly:</P>
            <CopyField command="bettergarmin-data" />
          </>
        )
      case 2:
        return (
          <>
            <P>The Worker hands your files to the app, but only to someone holding your access token.</P>
            <Ext href={cf('workers/onboarding')}>Create a Worker ("Start with Hello World")</Ext>
            <P>
              Name it <b>bettergarmin-sync</b> and click Deploy. Then click <b>Edit code</b>, replace everything with
              this code, and Deploy again:
            </P>
            <CopyBlock text={workerCode} label="Copy Worker code" />
            <P>
              Then go to the Worker's <b>Settings</b>:
            </P>
            <ul className="ml-4 list-disc text-sm text-[var(--text-secondary)]">
              <li>
                <b>Bindings → Add → R2 bucket</b>: variable name <code>DB_BUCKET</code>, bucket <code>bettergarmin-data</code>
              </li>
              <li>
                <b>Variables and Secrets → Add → Secret</b>: name <code>ACCESS_TOKEN</code>, value:
              </li>
            </ul>
            <CopyField command={s.accessToken} />
            <p className="text-xs text-[var(--text-tertiary)]">
              Generated just now in your browser. The app fills it in for you at the end.
            </p>
            <Input
              label="Your Worker's address (shown at the top of its page)"
              value={s.workerUrl}
              onChange={(workerUrl) => update({ workerUrl: workerUrl.trim() })}
              placeholder="https://bettergarmin-sync.your-name.workers.dev"
              status={s.workerUrl ? (/^https:\/\/.+\.workers\.dev\/?$/.test(s.workerUrl) ? 'ok' : undefined) : undefined}
            />
            {s.workerUrl && <WorkerCheck url={s.workerUrl} />}
          </>
        )
      case 3:
        return (
          <>
            <P>GitHub needs a key that can write to your bucket.</P>
            <Ext href={cf('r2/api-tokens/create')}>Create an R2 API token</Ext>
            <P>
              Choose <b>Object Read &amp; Write</b>, and apply it to the <b>bettergarmin-data</b> bucket. After creating it, keep
              the page open: you'll copy the <b>Access Key ID</b> and <b>Secret Access Key</b> in the next step. Cloudflare
              only shows the secret once.
            </P>
          </>
        )
      case 4:
        return (
          <>
            <P>Add these six repository secrets. Open the page, then add one at a time:</P>
            {repoUrl ? <Ext href={`${repoUrl}/settings/secrets/actions/new`}>Open "New repository secret"</Ext> : <Missing />}
            <SecretRow name="GARMIN_USERNAME" value="your Garmin Connect email" />
            <SecretRow name="GARMIN_PASSWORD" value="your Garmin Connect password" />
            <SecretRow name="R2_ACCOUNT_ID" copy={accountId ?? undefined} value={accountId ?? 'go back to step 2 to fill this in'} />
            <SecretRow name="R2_ACCESS_KEY_ID" value="Access Key ID from the previous step" />
            <SecretRow name="R2_SECRET_ACCESS_KEY" value="Secret Access Key from the previous step" />
            <SecretRow name="R2_BUCKET_NAME" copy="bettergarmin-data" value="bettergarmin-data" />
            <p className="text-xs text-[var(--text-tertiary)]">
              Accounts with two-step verification can't use the automated Garmin login. Secrets stay encrypted in your
              GitHub account; this app never sees them.
            </p>
          </>
        )
      case 5:
        return (
          <>
            <P>Start the first download. It fetches the last 7 days and takes about 2 minutes.</P>
            {repoUrl ? <Ext href={`${repoUrl}/actions/workflows/sync-garmin-data.yml`}>Open "Sync Garmin data" → Run workflow</Ext> : <Missing />}
            <P>
              Wait for the green tick. If it fails, open the run: the red step says what to fix (wrong password, bad key,
              and so on).
            </P>
          </>
        )
      case 6:
        return <ConnectStep workerUrl={s.workerUrl} token={s.accessToken} onConnected={() => go(7)} />
      case 7:
        return (
          <>
            <P>
              Optional: a <b>Sync now</b> button that pulls fresh data on demand, instead of waiting up to 30 minutes.
            </P>
            <Ext href="https://github.com/settings/personal-access-tokens/new">Create a fine-grained GitHub token</Ext>
            <P>
              Repository access: <b>only {s.repo || 'your fork'}</b>. Permissions: <b>Actions → Read and write</b>. Then add to
              your Worker's <b>Settings → Variables and Secrets</b>:
            </P>
            <SecretRow name="GITHUB_TOKEN (Secret)" value="the token you just created" />
            <SecretRow name="GITHUB_REPO (Text)" copy={s.owner && s.repo ? `${s.owner}/${s.repo}` : undefined} value={s.owner && s.repo ? `${s.owner}/${s.repo}` : 'owner/repo'} />
            <SecretRow name="GITHUB_REF (Text)" value="your fork's default branch, e.g. main" />
            <Button variant="secondary" onClick={() => go(8)}>
              Next
            </Button>
          </>
        )
      case 8:
        return <AutoSyncStep workerUrl={s.workerUrl} onDone={onDone} />
    }
  })()

  const canNext =
    (s.step === 0 && !!repoUrl) || (s.step === 1 && !!accountId) || (s.step === 2 && !!s.workerUrl) || (s.step >= 3 && s.step <= 5)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((label, i) => (
          <div key={label} className={cn('h-1.5 flex-1 rounded-full', i <= s.step ? 'bg-[var(--accent)]' : 'bg-[var(--ring-track)]')} />
        ))}
      </div>
      <p className="text-xs font-medium text-[var(--text-tertiary)]">
        Step {s.step + 1} of {STEPS.length}: {STEPS[s.step]}
      </p>
      <Card className="flex flex-col gap-3 text-left">{body}</Card>
      {s.step < 6 && (
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => go(s.step - 1)} disabled={s.step === 0}>
            Back
          </Button>
          <Button onClick={() => go(s.step + 1)} disabled={!canNext}>
            {s.step === 5 ? "It's done" : 'Next'}
          </Button>
        </div>
      )}
      {s.step === 6 && (
        <Button variant="ghost" onClick={() => go(5)} className="self-start">
          Back
        </Button>
      )}
    </div>
  )
}

function ConnectStep({ workerUrl, token, onConnected }: { workerUrl: string; token: string; onConnected: () => void }) {
  const { connectCloud } = useData()
  const [status, setStatus] = useState<'idle' | 'connecting' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <P>Everything's in place. Connect this app to your Worker:</P>
      <p className="break-all rounded-[var(--radius-control)] bg-black/20 px-3 py-2 font-mono text-xs">{workerUrl || 'no Worker address yet: go back to step 3'}</p>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <Button
        disabled={!workerUrl || status === 'connecting'}
        onClick={async () => {
          setStatus('connecting')
          setError(null)
          const r = await connectCloud({ workerUrl, token })
          if (r.ok) onConnected()
          else {
            setStatus('error')
            setError(r.error ?? 'Could not connect.')
          }
        }}
      >
        {status === 'connecting' ? 'Connecting…' : 'Connect'}
      </Button>
    </>
  )
}

/** Pings the Worker without a token: a 401 means it is deployed and protected, which is exactly right. */
function WorkerCheck({ url }: { url: string }) {
  const [result, setResult] = useState<'checking' | 'ok' | 'bad'>('checking')
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${url.replace(/\/+$/, '')}/manifest`)
        if (!cancelled) setResult(res.status === 401 ? 'ok' : 'bad')
      } catch {
        if (!cancelled) setResult('bad')
      }
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [url])
  if (result === 'checking') return <p className="text-xs text-[var(--text-tertiary)]">Checking the Worker…</p>
  return result === 'ok' ? (
    <p className="text-xs text-emerald-400">✓ Worker is up and protected.</p>
  ) : (
    <p className="text-xs text-amber-400">Can't confirm the Worker yet. Check the address, and that you deployed the new code.</p>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{children}</p>
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]"
    >
      {children}
      <span className="text-[var(--accent)]">↗</span>
    </a>
  )
}

function Missing() {
  return <p className="text-sm text-amber-400">Enter your GitHub username and repo in step 1 first.</p>
}

/** Your watch only uploads through the Garmin Connect app, so this step makes the phone side as hands-off as iOS allows. */
function AutoSyncStep({ workerUrl, onDone }: { workerUrl: string; onDone?: () => void }) {
  const shortcutOn = useShortcutSync()
  const syncUrl = workerUrl ? `${workerUrl.replace(/\/+$/, '')}/sync` : 'your Worker address + /sync'
  return (
    <>
      <P>
        Your watch only uploads through the <b>Garmin Connect</b> app. Until it runs, there's nothing new to sync. Do these on your iPhone:
      </P>
      <P>
        <b>1. Notifications</b> ⭐. In Garmin Connect, open your device → <b>Notifications &amp; Alerts</b> and turn <b>every</b> toggle on. A watch that gets
        alerts stays connected, so Garmin Connect syncs in the background much more often. Also keep Background App Refresh on, Low Power Mode off, and
        don't swipe the app closed.
      </P>
      <P>
        <b>2. The Shortcut</b> ⭐. In the Shortcuts app, make one named exactly <b>{SHORTCUT_NAME}</b>:
      </P>
      <ol className="ml-5 list-decimal text-sm text-[var(--text-secondary)]">
        <li>
          Tap ⓘ → turn on <b>Show in Share Sheet</b>, and set the Receive block at the top to <b>Text</b>
        </li>
        <li>
          <b>Open App</b> → Connect
        </li>
        <li>
          <b>Wait</b> → 5 seconds
        </li>
        <li>
          <b>Get Contents of URL</b> → method <b>POST</b>, header <code>Authorization</code> = <code>Bearer</code> + your access token, URL:
        </li>
      </ol>
      <SecretRow name="URL" value={syncUrl} copy={workerUrl ? syncUrl : undefined} />
      <ol start={5} className="ml-5 list-decimal text-sm text-[var(--text-secondary)]">
        <li>
          <b>If</b> Shortcut Input <b>is</b> <code>app</code> → <b>Open App</b> your browser (Safari or Bluefy); <b>Otherwise</b> → <b>Go to Home Screen</b>
        </li>
      </ol>
      <label className="flex items-center justify-between gap-3 text-sm">
        Make Sync now run this Shortcut ⭐ recommended
        <input type="checkbox" checked={shortcutOn} onChange={(e) => setShortcutSync(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
      </label>
      <P>
        <b>3. Automations.</b> In Shortcuts → Automation, add <b>Run Shortcut → {SHORTCUT_NAME}</b> (Run Immediately, Notify When Run off) for: ⭐ <b>Sleep → Wake Up</b>, ⭐ <b>App → Is
        Opened</b> (an app you use a few times a day), and optionally <b>Charger → Connected</b>.
      </P>
      <P>
        <b>4. Where to open BetterGarmin.</b> ⭐ Recommended: Safari → <b>Share → Add to Home Screen</b>, so it's always full screen. For live heart
        rate over Bluetooth, add the <Ext href="https://apps.apple.com/tt/app/ioswebble/id6761301368">beacio Safari extension</Ext> and allow it only on
        this site. Extensions don't run inside Home Screen apps, so the heart rate card there has an <b>Open in Safari</b> button that takes you to a
        Safari tab where it works. The Home Screen app has its own storage,
        so connect cloud sync once more inside it.
      </P>
      <P>The README has the full guide, with more trigger ideas and how to check it worked.</P>
      <Button variant="secondary" onClick={onDone}>
        Finish
      </Button>
    </>
  )
}

function SecretRow({ name, value, copy }: { name: string; value: string; copy?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-[var(--border-panel)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <code className="text-[13px] font-semibold">{name}</code>
        <CopyButton text={name.split(' ')[0]} label="Copy name" />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
        <span className="break-all">{value}</span>
        {copy && <CopyButton text={copy} label="Copy value" />}
      </div>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] hover:bg-white/10"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1400)
        } catch {
          // clipboard blocked; the text is visible to copy by hand
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  )
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-black/25 px-3 py-2">
      <span className="text-xs text-[var(--text-tertiary)]">{text.split('\n').length} lines of code</span>
      <CopyButton text={text} label={label} />
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  status,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  status?: 'ok' | 'bad'
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--text-tertiary)]">{label}</span>
      <span className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            'w-full rounded-[var(--radius-control)] border bg-[var(--bg-panel)] px-3 py-2.5 pr-8 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]',
            status === 'bad' ? 'border-amber-400/60' : 'border-[var(--border-panel)]',
          )}
        />
        {status === 'ok' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">✓</span>}
      </span>
      {hint && <span className="text-xs text-amber-400">{hint}</span>}
    </label>
  )
}
