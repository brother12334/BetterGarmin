import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { InfoButton } from '../../components/ui/InfoButton'
import type { AnalyticsDataset } from '../analytics/model'
import {
  progressionFindings,
  restRepsFinding,
  sleepPerformanceFinding,
  timeOfDayFinding,
  volumeRhrFinding,
  type Finding,
} from '../analytics/findings'
import { deleteExperiment, getExperiments, saveExperiment, type Experiment, type ExperimentTemplate } from '../analytics/store'
import { FindingCard } from './FindingCard'

interface TemplateSpec {
  question: string
  variables: string
  comparison: string
  needs: string
  run: (ds: AnalyticsDataset, from?: string) => Finding[]
}

const TEMPLATES: Record<ExperimentTemplate, TemplateSpec> = {
  'rest-reps': {
    question: 'Are longer rests followed by more reps on the next set?',
    variables: 'Rest reported before a set (Element 26) → change in reps vs. the previous set at the same load',
    comparison: 'Set pairs split at your median rest; Cliff’s delta on rep change',
    needs: 'Element 26 imports with rest times; ≥ 5 pairs on each side of the median',
    run: (ds, from) => [restRepsFinding(ds, { from })],
  },
  'sleep-performance': {
    question: 'Do I perform better after longer sleep?',
    variables: 'Watch sleep the night before → session performance relative to your recent norm for each exercise',
    comparison: 'Sessions split at your median sleep; Cliff’s delta',
    needs: 'Sleep data plus ≥ 10 sessions whose exercises have ≥ 3 earlier sessions',
    run: (ds, from) => [sleepPerformanceFinding(ds, { from })],
  },
  'time-of-day': {
    question: 'Does the time of day I train make a difference?',
    variables: 'Session start time (morning / afternoon / evening) → relative session performance',
    comparison: 'Two most common time slots; Cliff’s delta',
    needs: '≥ 5 comparable sessions in each of two time slots',
    run: (ds, from) => [timeOfDayFinding(ds, { from })],
  },
  'volume-rhr': {
    question: 'Do heavier training weeks change my resting heart rate?',
    variables: 'Weekly strength volume → median resting HR of the following week',
    comparison: 'Spearman rank correlation',
    needs: '≥ 8 weeks with training and resting-HR data',
    run: (ds, from) => [volumeRhrFinding(ds, { from })],
  },
  progression: {
    question: 'Which exercises are actually progressing?',
    variables: 'Working-set estimated 1RM per exercise over time',
    comparison: 'Last 3 sessions vs. up to 9 before; Cliff’s delta',
    needs: '≥ 6 sessions of an exercise',
    run: (ds, from) => progressionFindings(ds, null, { from }).filter((f) => f.evidence !== 'insufficient').slice(0, 4),
  },
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ExperimentsCard({ dataset }: { dataset: AnalyticsDataset }) {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [template, setTemplate] = useState<ExperimentTemplate>('rest-reps')
  const [prospective, setProspective] = useState(false)

  useEffect(() => {
    getExperiments().then(setExperiments)
  }, [])

  const add = async () => {
    await saveExperiment({
      id: `${Date.now()}`,
      template,
      question: TEMPLATES[template].question,
      startDay: prospective ? todayStr() : null,
      createdAt: Date.now(),
    })
    setExperiments(await getExperiments())
  }

  const spec = TEMPLATES[template]
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <p className="font-semibold">Personal experiments</p>
        <InfoButton title="Personal experiments">
          Pick a question and BetterGarmin turns it into measurable variables and a fixed comparison. "Exploratory" looks back at all your
          history — useful for ideas, but easy to over-read. "Prospective" only counts data from today on, so you decide what to test before
          seeing the result — stronger evidence. Keep training and sleep safe; don't deliberately cut sleep or rest to test something.
        </InfoButton>
      </div>

      <div className="mt-2 flex flex-col gap-2 text-sm">
        <select value={template} onChange={(e) => setTemplate(e.target.value as ExperimentTemplate)} className="rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-2">
          {(Object.keys(TEMPLATES) as ExperimentTemplate[]).map((k) => (
            <option key={k} value={k}>
              {TEMPLATES[k].question}
            </option>
          ))}
        </select>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
          <dt className="text-[var(--text-tertiary)]">Measures</dt>
          <dd>{spec.variables}</dd>
          <dt className="text-[var(--text-tertiary)]">Compares</dt>
          <dd>{spec.comparison}</dd>
          <dt className="text-[var(--text-tertiary)]">Needs</dt>
          <dd>{spec.needs}</dd>
        </dl>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input type="radio" checked={!prospective} onChange={() => setProspective(false)} /> Exploratory (all history)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={prospective} onChange={() => setProspective(true)} /> Prospective (from today)
          </label>
          <Button variant="secondary" className="ml-auto px-3 py-2 text-xs" onClick={add}>
            Add
          </Button>
        </div>
      </div>

      {experiments.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {experiments.map((e) => (
            <ExperimentResult
              key={e.id}
              experiment={e}
              dataset={dataset}
              onDelete={async () => {
                await deleteExperiment(e.id)
                setExperiments(await getExperiments())
              }}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function ExperimentResult({ experiment, dataset, onDelete }: { experiment: Experiment; dataset: AnalyticsDataset; onDelete: () => void }) {
  const results = useMemo(() => TEMPLATES[experiment.template].run(dataset, experiment.startDay ?? undefined), [experiment, dataset])
  return (
    <div className="rounded-control border border-[var(--border-panel)] p-3">
      <div className="mb-2 flex items-start justify-between gap-2 text-xs">
        <div>
          <p className="text-sm font-semibold">{experiment.question}</p>
          <p className="text-[var(--text-tertiary)]">
            {experiment.startDay
              ? `Prospective — observing since ${new Date(`${experiment.startDay}T00:00:00`).toLocaleDateString()}`
              : 'Exploratory — all history, treat as a hypothesis'}
          </p>
        </div>
        <button type="button" onClick={onDelete} className="text-[var(--text-tertiary)] hover:text-rose-400">
          Remove
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {results.length === 0 && <p className="text-xs text-[var(--text-tertiary)]">No exercise has enough sessions yet.</p>}
        {results.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </div>
  )
}
