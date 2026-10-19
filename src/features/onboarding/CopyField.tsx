import { useState } from 'react'
import { CheckIcon, CopyIcon } from '../../app/icons'

export function CopyField({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard access can be denied; the command text is still selectable/visible
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-control bg-black/30 px-4 py-3 font-mono text-sm text-[var(--text-primary)]">
      <code className="overflow-x-auto whitespace-pre">{command}</code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy command"
        className="flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]"
      >
        {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
