import { useRef, useState, type ReactNode } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { cn } from '../../lib/cn'
import type { HrSample } from './workoutTimeline'
import { fmtRest, type Grade, type Letter, type WorkoutSummary } from './workoutSummary'

/**
 * Post-workout summary: swipeable story cards (one big idea each, with its grade), followed by the full report card
 * and a short plan.
 */

const GRADE_COLOR = (l: Letter) => (l.startsWith('A') ? '#2fd08a' : l.startsWith('B') ? '#4f8dff' : l.startsWith('C') ? '#ffc24b' : '#ff4d6d')
const BAND_COLORS = ['#7d8aa3', '#4f8dff', '#2fd08a', '#ffc24b', '#ff4d6d']

function GradeChip({ grade }: { grade: Grade | undefined }) {
  if (!grade) return null
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-1 text-xs font-bold text-[var(--text-primary)]">
      <span style={{ color: GRADE_COLOR(grade.letter) }}>{grade.letter}</span> {grade.title}
    </span>
  )
}

function Ring({ score, letter }: { score: number; letter: Letter }) {
  const r = 40
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" width="104" height="104" aria-label={`Overall grade ${letter}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={GRADE_COLOR(letter)} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="58" textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--text-primary)">
        {letter}
      </text>
    </svg>
  )
}

function Spark({ series, color }: { series: HrSample[]; color: string }) {
  if (series.length < 2) return null
  const w = 300
  const h = 90
  const t0 = series[0].t
  const t1 = series[series.length - 1].t
  const vs = series.map((s) => s.v)
  const lo = Math.min(...vs) - 5
  const hi = Math.max(...vs) + 5
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * w
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h
  const d = series.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ')
  const peak = series.reduce((a, b) => (b.v > a.v ? b : a))
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="none" className="h-24" aria-label="Heart rate during the workout">
      <path d={`${d} L${w},${h} L0,${h}Z`} fill={color} opacity="0.18" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(peak.t)} cy={y(peak.v)} r="4" fill={color} />
    </svg>
  )
}

/** A story card in the user's own card style (glass, liquid, solid, outline), washed with the card's colour. */
function Slide({ tint, label, children, footer }: { tint: string; label: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="glass-panel relative flex w-[86%] shrink-0 snap-center flex-col justify-between gap-4 overflow-hidden rounded-card p-5 sm:w-[360px]" style={{ minHeight: 300 }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${tint} 26%, transparent), transparent 70%), linear-gradient(160deg, color-mix(in srgb, ${tint} 10%, transparent), transparent)` }}
      />
      <p className="relative text-xs font-semibold uppercase tracking-[0.09em]" style={{ color: tint }}>
        {label}
      </p>
      <div className="relative flex flex-col gap-2">{children}</div>
      {footer && <div className="relative">{footer}</div>}
    </div>
  )
}

const Big = ({ children }: { children: ReactNode }) => <p className="text-5xl font-extrabold leading-none tabular-nums tracking-tight">{children}</p>
const Sub = ({ children }: { children: ReactNode }) => <p className="text-sm text-[var(--text-secondary)]">{children}</p>

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

export function WorkoutStory({ summary: s, title, dateLabel, hrSeries, weight }: { summary: WorkoutSummary; title: string; dateLabel: string; hrSeries: HrSample[]; weight: (kg: number | null) => string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const grade = (a: Grade['area']) => s.grades.find((g) => g.area === a)

  const slides: ReactNode[] = [
    <Slide key="overview" tint="var(--accent)" label={`${dateLabel} · summary`}>
      <div className="flex items-center gap-4">
        {s.overall && <Ring score={s.overall.score} letter={s.overall.letter} />}
        <div className="min-w-0">
          <p className="text-2xl font-extrabold leading-tight">{title}</p>
          <Sub>
            {s.overall ? `Overall ${s.overall.letter} across ${s.grades.length} areas.` : 'Not enough data to grade this one.'}
            {s.prs ? ` ${s.prs} PR${s.prs > 1 ? 's' : ''}.` : ''}
          </Sub>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Duration" value={s.durationMin != null ? `${s.durationMin}m` : '—'} />
        <Stat label="Calories" value={s.calories ?? '—'} />
        <Stat label="Sets" value={s.workingSets} />
      </div>
    </Slide>,

    <Slide key="effort" tint="#ff8a4c" label="Effort" footer={<GradeChip grade={grade('effort')} />}>
      {s.calories != null ? (
        <>
          <Big>{s.calories}</Big>
          <p className="text-base font-bold">calories burned</p>
          {s.caloriesPerMin != null && <Sub>{s.caloriesPerMin} per minute over {s.durationMin} minutes</Sub>}
        </>
      ) : (
        <Sub>No calories yet: they come from the band's recorded Strength activity once it syncs.</Sub>
      )}
      <div className="mt-2 grid grid-cols-3 gap-3">
        <Stat label="Load" value={s.trainingLoad ?? '—'} />
        <Stat label="Aerobic" value={s.aerobicTE?.toFixed(1) ?? '—'} />
        <Stat label="Anaerobic" value={s.anaerobicTE?.toFixed(1) ?? '—'} />
      </div>
    </Slide>,

    <Slide key="heart" tint="#ff4d6d" label="Heart" footer={<GradeChip grade={grade('heart')} />}>
      {s.hrAvg != null ? (
        <>
          <Spark series={hrSeries} color="#ff4d6d" />
          <Big>
            {s.hrAvg}
            <span className="ml-1 text-base font-semibold text-[var(--text-tertiary)]">avg bpm</span>
          </Big>
          <Sub>
            Peak {s.hrMax}
            {s.peakSet ? ` on ${s.peakSet.exercise} set ${s.peakSet.setNumber}` : ''}
            {s.hrMin != null ? ` · lowest ${s.hrMin}` : ''}
          </Sub>
          {s.effortBandsMin && (
            <div className="mt-1 flex h-2.5 gap-1 overflow-hidden rounded-full">
              {s.effortBandsMin.map((m, i) => (
                <i key={i} style={{ flex: Math.max(m, 0.2), background: BAND_COLORS[i] }} />
              ))}
            </div>
          )}
        </>
      ) : (
        <Sub>No heart rate for this workout yet. Sync your watch and it fills in.</Sub>
      )}
    </Slide>,

    <Slide key="strength" tint="#2dd4bf" label="Strength" footer={<GradeChip grade={grade('strength')} />}>
      <Big>
        {s.volumeKg.toLocaleString()}
        <span className="ml-1 text-base font-semibold text-[var(--text-tertiary)]">kg moved</span>
      </Big>
      <Sub>
        {s.workingSets} working sets · {s.reps} reps
      </Sub>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {s.topSets.slice(0, 5).map((t) => (
          <li key={t.exercise} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {t.exercise}
              {t.pr && <Badge tone="warning" className="ml-2">PR</Badge>}
            </span>
            <b className="shrink-0 tabular-nums">
              {weight(t.weight)} × {t.reps}
            </b>
          </li>
        ))}
      </ul>
    </Slide>,

    <Slide
      key="rest"
      tint="#2fd08a"
      label="Rest & recovery"
      footer={
        <div className="flex flex-wrap gap-2">
          <GradeChip grade={grade('rest')} />
          <GradeChip grade={grade('recovery')} />
        </div>
      }
    >
      <Big>{s.restAvgSec != null ? fmtRest(s.restAvgSec) : '—'}</Big>
      <p className="text-base font-bold">average rest</p>
      <Sub>
        {s.shortRests} rest{s.shortRests === 1 ? '' : 's'} under 90 s
        {s.hrDrop60Avg != null ? ` · heart rate fell ${s.hrDrop60Avg} bpm in the first minute of rest` : ''}
      </Sub>
      {s.liftingMin != null && s.durationMin != null && <Sub>{s.liftingMin} of {s.durationMin} minutes spent lifting</Sub>}
    </Slide>,

    ...(s.vsLast.length
      ? [
          <Slide key="vs" tint="var(--accent)" label="You vs last time">
            {s.vsLast.map((c) => (
              <div key={c.label} className="flex items-baseline justify-between">
                <span className="text-base">{c.label}</span>
                <b className={cn('text-3xl font-extrabold tabular-nums', (c.change >= 0) === c.higherIsBetter ? 'text-emerald-500' : 'text-rose-500')}>
                  {c.change > 0 ? '+' : ''}
                  {c.change}%
                </b>
              </div>
            ))}
            <Sub>Compared on the same exercises from their last sessions.</Sub>
          </Slide>,
        ]
      : []),

    <Slide key="next" tint="#4f8dff" label="Next up">
      {s.recoveryHours != null && (
        <>
          <Big>
            {s.recoveryHours}
            <span className="ml-1 text-base font-semibold text-[var(--text-tertiary)]">hours</span>
          </Big>
          <Sub>estimated recovery before training these muscles hard again</Sub>
        </>
      )}
      <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
        {s.nextUp.slice(1).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </Slide>,
  ]

  const go = (i: number) => {
    const el = scroller.current?.children[i] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex gap-1" role="tablist" aria-label="Summary cards">
          {slides.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === index}
              aria-label={`Card ${i + 1}`}
              onClick={() => go(i)}
              className={cn('h-1 flex-1 rounded-full transition-colors', i <= index ? 'bg-[var(--text-primary)]' : 'bg-[var(--ring-track)]')}
            />
          ))}
        </div>
        <div
          ref={scroller}
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
          onScroll={(e) => {
            const el = e.currentTarget
            const w = (el.children[0] as HTMLElement | undefined)?.offsetWidth ?? 1
            setIndex(Math.min(slides.length - 1, Math.round(el.scrollLeft / (w + 12))))
          }}
        >
          {slides}
        </div>
      </div>

      {s.grades.length > 0 && (
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <p className="font-semibold">Report card</p>
            {s.overall && (
              <span className="text-sm font-bold" style={{ color: GRADE_COLOR(s.overall.letter) }}>
                Overall {s.overall.letter}
              </span>
            )}
          </div>
          <div className="flex flex-col divide-y divide-[var(--border-panel)]">
            {s.grades.map((g) => (
              <div key={g.area} className="flex items-center gap-3 py-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-control text-xl font-extrabold" style={{ color: GRADE_COLOR(g.letter), background: `${GRADE_COLOR(g.letter)}22` }}>
                  {g.letter}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{g.title}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{g.basis}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ring-track)]">
                    <i className="block h-full rounded-full" style={{ width: `${g.score}%`, background: GRADE_COLOR(g.letter) }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-control bg-emerald-500/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-400">Next up</p>
            <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {s.nextUp.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Grades and recovery time are BetterGarmin estimates from this workout's data, not Garmin's.</p>
        </Card>
      )}
    </div>
  )
}
