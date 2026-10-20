import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { useData } from '../../app/DataProvider'
import { formatRelativeTime } from '../../lib/relativeTime'
import { useAnalytics } from '../analytics/useAnalytics'
import { capabilities, marker, type Capability, type MarkerKey } from './engine'
import { REFERENCES } from './evidence'
import {
  allInsights,
  clockLabel,
  type CircadianView,
  type EnergyView,
  type Insight,
  type MomentumView,
  type RadarView,
  type SleepDebtView,
  type TrajectoryDomain,
} from './features'

const CONF_TEXT = { insufficient: 'Not enough data', low: 'Low confidence', moderate: 'Moderate confidence', high: 'High confidence' }
const PROV_TEXT = { device: 'measured by the band', 'garmin-derived': 'calculated by Garmin', betterGarmin: 'calculated by BetterGarmin' }
const TONE = { good: 'text-emerald-500', watch: 'text-amber-500', neutral: 'text-[var(--text-secondary)]' }

/** Physiological intelligence: one card per feature, each with its evidence and limits a tap away. */
export function IntelligencePage() {
  const { result, loading, error } = useAnalytics()
  const { lastSynced } = useData()
  const days = result?.dataset.days
  const insights = useMemo(() => (days ? allInsights(days) : null), [days])
  const caps = useMemo(() => (days ? capabilities(days) : null), [days])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/insights" className="text-sm text-[var(--accent)]">
          ‹ Insights
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Intelligence</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Patterns in your own data, compared with your own baseline. Synced {formatRelativeTime(lastSynced)}.
        </p>
      </div>
      {error && <Card className="text-sm text-rose-400">{error}</Card>}
      {loading || !insights || !caps ? (
        <>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </>
      ) : (
        <>
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} caps={caps}>
              <Visual insight={i} />
            </InsightCard>
          ))}
          <p className="text-center text-xs text-[var(--text-tertiary)]">Not medical advice. These describe patterns; they don’t diagnose anything.</p>
        </>
      )}
    </div>
  )
}

function InsightCard({ insight: i, caps, children }: { insight: Insight; caps: Record<MarkerKey, Capability>; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ready = i.state === 'ready'
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-[var(--text-tertiary)]">{i.title}</p>
          <p className="mt-1 text-lg font-semibold leading-snug">{i.conclusion}</p>
        </div>
        {i.maturity === 'experimental' && <Badge tone="warning">Experimental</Badge>}
      </div>

      {ready && children}

      {ready && i.contributors.length > 0 && (
        <dl className="grid grid-cols-2 gap-3">
          {i.contributors.map((c) => (
            <div key={c.label}>
              <dt className="text-xs text-[var(--text-tertiary)]">{c.label}</dt>
              <dd className="text-base font-semibold tabular-nums">{c.value}</dd>
              <dd className={`text-xs ${TONE[c.tone ?? 'neutral']}`}>{c.note}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
        <span>
          {CONF_TEXT[i.confidence]}
          {i.asOf ? ` · data to ${new Date(`${i.asOf}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
        </span>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="min-h-11 text-[var(--accent)]">
          {open ? 'Hide how this works' : 'How this works'}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-[var(--border-panel)] pt-3 text-sm text-[var(--text-secondary)]">
          <p>
            <b className="text-[var(--text-primary)]">What it estimates.</b> {i.how.estimates}
          </p>
          <p>
            <b className="text-[var(--text-primary)]">Why these signals.</b> {i.how.why}
          </p>
          <div>
            <b className="text-[var(--text-primary)]">Signals used</b>
            <ul className="mt-1 flex flex-col gap-1">
              {i.how.markers.map((k) => {
                const m = marker(k)
                const c = caps[k]
                return (
                  <li key={k} className="flex justify-between gap-3">
                    <span>
                      {m.label} <span className="text-[var(--text-tertiary)]">({PROV_TEXT[m.provenance]})</span>
                    </span>
                    <span className={c.available ? 'text-[var(--text-tertiary)]' : 'text-amber-500'}>{c.available ? `${c.recentDays}/30 days, latest ${c.latestDay}` : 'not available'}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <div>
            <b className="text-[var(--text-primary)]">Limitations</b>
            <ul className="ml-4 mt-1 list-disc">
              {i.how.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          <div>
            <b className="text-[var(--text-primary)]">Evidence</b> <span className="text-[var(--text-tertiary)]">({i.maturity === 'experimental' ? 'experimental model' : 'established method'})</span>
            <ul className="mt-1 flex flex-col gap-2 text-xs">
              {i.how.references.map((r) => (
                <li key={r}>
                  <span className="text-[var(--text-primary)]">{REFERENCES[r].supports}</span>
                  <br />
                  <span className="text-[var(--text-tertiary)]">{REFERENCES[r].cite}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}

function Visual({ insight }: { insight: Insight }) {
  switch (insight.id) {
    case 'energy':
      return <EnergyOrb view={insight.view as EnergyView} />
    case 'radar':
      return <RadarStrip view={insight.view as RadarView} />
    case 'momentum':
      return <MomentumLines view={insight.view as MomentumView} />
    case 'circadian':
      return <SleepClock view={insight.view as CircadianView} />
    case 'sleepDebt':
      return <DebtBars view={insight.view as SleepDebtView} />
    case 'trajectory':
      return <Trajectory domains={(insight.view as { domains: TrajectoryDomain[] }).domains} />
    default:
      return null
  }
}

// ---- Visuals ---------------------------------------------------------------------------------------------

/** A soft orb whose glow follows the overall picture, with each component as a bar either side of "usual". */
function EnergyOrb({ view }: { view: EnergyView }) {
  const hue = view.overall === 'above' ? 'var(--accent)' : view.overall === 'below' ? '#f59e0b' : '#94a3b8'
  return (
    <div className="flex items-center gap-5">
      <div
        aria-hidden
        className="h-24 w-24 shrink-0 rounded-full motion-safe:animate-[pulse_6s_ease-in-out_infinite]"
        style={{ background: `radial-gradient(circle at 35% 30%, white 0%, ${hue} 45%, transparent 75%)`, boxShadow: `0 0 40px -6px ${hue}` }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2" role="img" aria-label="Last night compared with your usual nights">
        {view.components.map((c) => (
          <Diverging key={c.label} label={c.label} z={c.z} />
        ))}
      </div>
    </div>
  )
}

function Diverging({ label, z }: { label: string; z: number | null }) {
  const w = z == null ? 0 : Math.min(Math.abs(z), 3) / 3
  return (
    <div className="text-xs">
      <div className="flex justify-between text-[var(--text-tertiary)]">
        <span>{label}</span>
        <span>{z == null ? 'no data' : Math.abs(z) < 1 ? 'usual' : z > 0 ? 'better' : 'worse'}</span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-[var(--ring-track)]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--text-tertiary)]" />
        {z != null && (
          <span
            className={`absolute inset-y-0 rounded-full ${z >= 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={z >= 0 ? { left: '50%', width: `${w * 50}%` } : { right: '50%', width: `${w * 50}%` }}
          />
        )}
      </div>
    </div>
  )
}

const RADAR_LABELS: MarkerKey[] = ['restingHr', 'hrv', 'respiration', 'awake', 'spo2']

/** The last three days, one row per signal: a filled dot where that signal was outside its usual range. */
function RadarStrip({ view }: { view: RadarView }) {
  return (
    <div className="grid grid-cols-[1fr_repeat(3,2.5rem)] items-center gap-y-2 text-xs" role="table" aria-label="Signals outside their usual range, last 3 days">
      <span />
      {view.days.map((d) => (
        <span key={d.day} className="text-center text-[var(--text-tertiary)]">
          {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
        </span>
      ))}
      {RADAR_LABELS.map((k) => (
        <Row key={k} label={marker(k).label} cells={view.days.map((d) => d.outside.includes(k))} />
      ))}
    </div>
  )
}

function Row({ label, cells }: { label: string; cells: boolean[] }) {
  return (
    <>
      <span className="text-[var(--text-secondary)]">{label}</span>
      {cells.map((on, i) => (
        <span key={i} className="flex justify-center">
          <span className={`h-3 w-3 rounded-full ${on ? 'bg-amber-500' : 'bg-[var(--ring-track)]'}`} aria-label={on ? 'outside usual range' : 'usual'} />
        </span>
      ))}
    </>
  )
}

/** Each marker's last five weeks against a shaded band of its usual range. */
function MomentumLines({ view }: { view: MomentumView }) {
  return (
    <div className="flex flex-col gap-3">
      {view.markers.map((m) => (
        <div key={m.key}>
          <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
            <span>{m.label}</span>
            <span className={m.direction === 'toward' ? 'text-emerald-500' : m.direction === 'away' ? 'text-amber-500' : ''}>
              {m.direction === 'toward' ? '↗ improving' : m.direction === 'away' ? '↘ drifting' : '→ steady'}
            </span>
          </div>
          <Spark series={m.series.map((s) => s[1])} band={m.band} />
        </div>
      ))}
    </div>
  )
}

function Spark({ series, band }: { series: number[]; band?: [number, number] }) {
  if (series.length < 2) return null
  const lo = Math.min(...series, band?.[0] ?? Infinity)
  const hi = Math.max(...series, band?.[1] ?? -Infinity)
  const y = (v: number) => 36 - ((v - lo) / (hi - lo || 1)) * 32
  const x = (i: number) => (i / (series.length - 1)) * 100
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-1 h-10 w-full" aria-hidden>
      {band && <rect x="0" width="100" y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--accent)" opacity="0.12" />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/** A 24-hour dial with one arc per night: tight overlapping arcs mean regular sleep. */
function SleepClock({ view }: { view: CircadianView }) {
  const R = 70
  const pt = (h: number, r: number) => {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]
  }
  const arc = (s: number, e: number, r: number) => {
    const span = (e - s + 24) % 24
    const [x1, y1] = pt(s, r)
    const [x2, y2] = pt(e, r)
    return `M${x1},${y1} A${r},${r} 0 ${span > 12 ? 1 : 0} 1 ${x2},${y2}`
  }
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 200 200" className="h-40 w-40 shrink-0" role="img" aria-label={`Sleep timing over ${view.nights.length} nights, usual midpoint ${clockLabel(view.midpointMean)}`}>
        <circle cx="100" cy="100" r={R + 14} fill="none" stroke="var(--ring-track)" strokeWidth="1" />
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = pt(h, R + 26)
          return (
            <text key={h} x={x} y={y} fontSize="9" textAnchor="middle" dominantBaseline="middle" fill="var(--text-tertiary)">
              {h === 0 ? '12a' : h === 12 ? '12p' : h === 6 ? '6a' : '6p'}
            </text>
          )
        })}
        {view.nights.map((n, i) => (
          <path key={n.day} d={arc(n.start, n.end, R - i * 3)} fill="none" stroke={n.free ? '#a78bfa' : 'var(--accent)'} strokeWidth="2.5" strokeLinecap="round" opacity={0.35 + (0.65 * i) / view.nights.length} />
        ))}
      </svg>
      <div className="text-xs text-[var(--text-tertiary)]">
        <p>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          Weeknights
        </p>
        <p className="mt-1">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-400" />
          Weekend nights
        </p>
        <p className="mt-2">Newer nights are brighter and on the outside.</p>
      </div>
    </div>
  )
}

/** Fourteen nights as bars against the 7-hour line; the part below the line is the shortfall. */
function DebtBars({ view }: { view: SleepDebtView }) {
  const max = Math.max(view.referenceMinutes + 60, ...view.nights.map((n) => n.minutes ?? 0))
  return (
    <div className="relative flex h-28 items-end gap-1" role="img" aria-label="Sleep over the last 14 nights compared with 7 hours">
      <span className="absolute inset-x-0 border-t border-dashed border-[var(--text-tertiary)]" style={{ bottom: `${(view.referenceMinutes / max) * 100}%` }} />
      {view.nights.map((n) => (
        <div key={n.day} className="flex h-full flex-1 flex-col justify-end">
          {n.minutes == null ? (
            <div className="h-1 rounded-full bg-[var(--ring-track)]" title="not recorded" />
          ) : (
            <div className={`rounded-t-md ${n.shortfall > 0 ? 'bg-amber-500/80' : 'bg-[var(--accent)]'}`} style={{ height: `${(n.minutes / max) * 100}%` }} />
          )}
        </div>
      ))}
    </div>
  )
}

/** Small multiples: each domain on its own line with 30/90/180-day verdicts. */
function Trajectory({ domains }: { domains: TrajectoryDomain[] }) {
  const word = { rising: '↑', falling: '↓', stable: '→', insufficient: '·' }
  return (
    <div className="flex flex-col divide-y divide-[var(--border-panel)]">
      {domains.map((d) => (
        <div key={d.key} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 py-2">
          <span className="text-xs text-[var(--text-secondary)]">{d.label}</span>
          <Spark series={d.series.map((s) => s[1])} />
          <span className="flex gap-2 text-xs tabular-nums text-[var(--text-tertiary)]">
            {d.windows.map((w) => (
              <span key={w.days} title={`${w.days} days: ${w.trend}`}>
                {w.days}d {word[w.trend]}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}
