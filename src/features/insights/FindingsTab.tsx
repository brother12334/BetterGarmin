import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { InfoButton } from '../../components/ui/InfoButton'
import { fingerprintOf, type Finding } from '../analytics/findings'
import type { Indicator, RecoverySummary } from '../analytics/recovery'
import { getAllFeedback, setFeedback, type FindingFeedback } from '../analytics/store'
import { FindingCard } from './FindingCard'

const STATUS_TEXT: Record<Indicator['status'], string> = {
  insufficient: 'Not enough data',
  typical: 'Usual',
  deviation: 'Different',
  sustained: 'Different for days',
}

function formatValue(i: Indicator, v: number | null | undefined): string {
  if (v == null) return '—'
  if (i.key === 'sleepMinutes') return `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`
  if (i.key === 'bedtime') {
    const h = (v + 12) % 24
    return `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
  }
  return `${Math.round(v * 10) / 10} ${i.unit}`
}

export function RecoveryCard({ recovery }: { recovery: RecoverySummary }) {
  return (
    <Card>
      <div className="mb-1 flex items-center gap-1.5">
        <p className="font-semibold">Recovery indicators</p>
        <InfoButton title="Recovery indicators">
          Each indicator is compared with your own recent normal (median of the 28 days before the last week). There is deliberately no
          combined score: the indicators are shown side by side, and the summary only counts how many differ in the direction often
          associated with less recovery. Wearable data cannot diagnose fatigue, overtraining or illness.
        </InfoButton>
      </div>
      <p className="mb-3 text-sm text-[var(--text-secondary)]">{recovery.statement}</p>
      <div className="divide-y divide-[var(--border-panel)]">
        {recovery.indicators.map((i) => {
          const tone =
            i.status === 'insufficient' || i.status === 'typical'
              ? 'text-[var(--text-tertiary)]'
              : i.lessRecoveredDirection
                ? 'text-amber-400'
                : 'text-sky-400'
          return (
            <div key={i.key} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5">
                  {i.label}
                  {i.contextOnly && <span className="rounded bg-[var(--bg-panel)] px-1.5 text-[10px] text-[var(--text-tertiary)]">context</span>}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {i.key === 'trainingFrequency' ? `${i.recentN} in last 7 days` : `last 7 days ${formatValue(i, i.recent)}`}
                  {i.baseline ? ` · usual ${i.key === 'trainingFrequency' ? `${i.baseline.median}/wk` : formatValue(i, i.baseline.median)}` : ''}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-medium ${tone}`}>
                {STATUS_TEXT[i.status]}
                {i.direction ? (i.direction === 'above' ? ' ↑' : ' ↓') : ''}
              </span>
            </div>
          )
        })}
      </div>
      {recovery.missing.length > 0 && <p className="mt-2 text-xs text-[var(--text-tertiary)]">Not enough history yet for: {recovery.missing.join(', ')}.</p>}
    </Card>
  )
}

export function FindingsTab({ findings, recovery }: { findings: Finding[]; recovery: RecoverySummary }) {
  const [feedback, setFeedbackMap] = useState<Map<string, FindingFeedback>>(new Map())
  const [showDismissed, setShowDismissed] = useState(false)
  const [showPending, setShowPending] = useState(false)
  const location = useLocation()

  useEffect(() => {
    getAllFeedback().then(setFeedbackMap)
  }, [])

  useEffect(() => {
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash, feedback])

  const update = async (id: string, patch: Partial<FindingFeedback>) => {
    await setFeedback(id, patch)
    setFeedbackMap(await getAllFeedback())
  }

  const { active, dismissed, pending } = useMemo(() => {
    const active: { f: Finding; updated: boolean }[] = []
    const dismissed: Finding[] = []
    const pending: Finding[] = []
    for (const f of findings) {
      if (f.evidence === 'insufficient') {
        pending.push(f)
        continue
      }
      const fb = feedback.get(f.id)
      if (fb?.dismissed) {
        // A dismissed finding comes back only if what it says has changed since.
        if (fb.fingerprint && fb.fingerprint !== fingerprintOf(f)) active.push({ f, updated: true })
        else dismissed.push(f)
      } else active.push({ f, updated: false })
    }
    return { active, dismissed, pending }
  }, [findings, feedback])

  return (
    <div className="flex flex-col gap-4">
      <RecoveryCard recovery={recovery} />

      <div className="flex items-center gap-1.5">
        <p className="font-semibold">What your data shows</p>
        <InfoButton title="Findings">
          Patterns computed directly from your logged workouts and Garmin data, ordered by evidence and size. Each one lists the period,
          the number of observations, how it was calculated and other explanations. Observed relationships are not proof of cause.
        </InfoButton>
      </div>
      {active.length === 0 && <Card className="text-sm text-[var(--text-secondary)]">No findings with enough data yet — keep logging and syncing.</Card>}
      {active.map(({ f, updated }) => (
        <FindingCard
          key={f.id}
          finding={f}
          updated={updated}
          useful={feedback.get(f.id)?.useful}
          onUseful={() => update(f.id, { useful: !feedback.get(f.id)?.useful })}
          onDismiss={() => update(f.id, { dismissed: true, fingerprint: fingerprintOf(f) })}
        />
      ))}

      {pending.length > 0 && (
        <Card>
          <button type="button" className="flex w-full items-center justify-between text-sm" onClick={() => setShowPending((v) => !v)}>
            <span className="font-semibold">Waiting for more data ({pending.length})</span>
            <span className="text-xs text-sky-400">{showPending ? 'Hide' : 'Show'}</span>
          </button>
          {showPending && (
            <ul className="mt-2 flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">
              {pending.map((f) => (
                <li key={f.id}>
                  <b className="text-[var(--text-primary)]">{f.title}</b> — {f.n} {f.nLabel} so far; needs {f.needs}.
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {dismissed.length > 0 && (
        <button type="button" className="self-start text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" onClick={() => setShowDismissed((v) => !v)}>
          {showDismissed ? 'Hide' : 'Show'} {dismissed.length} dismissed
        </button>
      )}
      {showDismissed &&
        dismissed.map((f) => (
          <FindingCard key={f.id} finding={f} compact onDismiss={() => update(f.id, { dismissed: false })} />
        ))}
    </div>
  )
}
