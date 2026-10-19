import type { CommandStatus } from '../../lib/band/bandStore'
import { cn } from '../../lib/cn'

const LABELS: Record<CommandStatus['stage'], string> = {
  sending: 'Sending…',
  sent: 'Sent · waiting for the band',
  accepted: 'Accepted · waiting for the band to confirm',
  confirmed: 'Band confirmed',
  failed: 'Failed',
}

const NAMES: Record<CommandStatus['command'], string> = { START: 'Start', PAUSE: 'Pause', RESUME: 'Resume', SAVE: 'Save', DISCARD: 'Discard' }

/** Shows how far a band command got: sent, accepted by the band, or confirmed by a band event. */
export function CommandStage({ status }: { status: CommandStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        status.stage === 'confirmed' && 'bg-emerald-500/15 text-emerald-400',
        status.stage === 'accepted' && 'bg-sky-500/15 text-sky-400',
        (status.stage === 'sending' || status.stage === 'sent') && 'bg-slate-500/20 text-[var(--text-secondary)]',
        status.stage === 'failed' && 'bg-rose-500/15 text-rose-400',
      )}
      title={status.error}
    >
      Band {NAMES[status.command]}: {LABELS[status.stage]}
      {status.stage === 'failed' && status.error ? ` (${status.error})` : ''}
    </span>
  )
}
