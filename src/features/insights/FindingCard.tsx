import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import type { Finding } from '../analytics/findings'
import type { Evidence } from '../analytics/robust'

const EVIDENCE_STYLE: Record<Evidence, { label: string; className: string }> = {
  strong: { label: 'Consistent pattern', className: 'bg-emerald-500/15 text-emerald-400' },
  moderate: { label: 'Moderate evidence', className: 'bg-sky-500/15 text-sky-400' },
  weak: { label: 'Weak / exploratory', className: 'bg-slate-500/20 text-[var(--text-secondary)]' },
  insufficient: { label: 'Not enough data', className: 'bg-slate-500/20 text-[var(--text-tertiary)]' },
}

const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const s = EVIDENCE_STYLE[evidence]
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.className}`}>{s.label}</span>
}

export function FindingCard({
  finding,
  updated,
  useful,
  onUseful,
  onDismiss,
  compact,
}: {
  finding: Finding
  updated?: boolean
  useful?: boolean
  onUseful?: () => void
  onDismiss?: () => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card id={`finding-${finding.id}`} className="scroll-mt-24">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold leading-snug">{finding.title}</p>
        <EvidenceChip evidence={finding.evidence} />
      </div>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{finding.summary}</p>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        {shortDate(finding.startDay)} – {shortDate(finding.endDay)} · {finding.n} {finding.nLabel}
        {finding.effectLabel ? ` · ${finding.effectLabel}` : ''}
        {updated && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400">Updated</span>}
      </p>
      {finding.needs && <p className="mt-1 text-xs text-[var(--text-tertiary)]">Needs: {finding.needs}.</p>}

      {!compact && finding.evidence !== 'insufficient' && (
        <>
          <button type="button" className="mt-2 text-xs text-sky-400 hover:text-sky-300" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : 'How this was worked out'}
          </button>
          {open && (
            <div className="mt-2 flex flex-col gap-2 text-xs text-[var(--text-secondary)]">
              {finding.metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {finding.metrics.map((m) => (
                    <div key={m.label} className="rounded-xl bg-[var(--bg-panel)] p-2">
                      <p className="text-[var(--text-tertiary)]">{m.label}</p>
                      <p className="font-semibold text-[var(--text-primary)]">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}
              <p>
                <b>Method.</b> {finding.method}
              </p>
              {finding.alternatives.length > 0 && (
                <div>
                  <b>Other possible explanations</b>
                  <ul className="mt-0.5 list-disc pl-4">
                    {finding.alternatives.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[var(--text-tertiary)]">
                Evidence levels are a rule of thumb from sample size and effect size in your own data — not a statistical significance test.
              </p>
            </div>
          )}
        </>
      )}

      {(finding.links.length > 0 || onUseful || onDismiss) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {finding.links.map((l) => (
            <Link key={l.to + l.label} to={l.to} className="text-sky-400 hover:text-sky-300">
              {l.label} →
            </Link>
          ))}
          <span className="flex-1" />
          {onUseful && (
            <button type="button" onClick={onUseful} className={useful ? 'text-emerald-400' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}>
              {useful ? '✓ Useful' : 'Useful'}
            </button>
          )}
          {onDismiss && (
            <button type="button" onClick={onDismiss} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              Dismiss
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
