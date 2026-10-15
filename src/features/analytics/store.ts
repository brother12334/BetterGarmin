import { openDB, type IDBPDatabase } from 'idb'

/** Insight feedback and personal experiments — local to this browser, like the rest of the strength log. */
const DB_NAME = 'bettergarmin-insights'
const FEEDBACK = 'feedback'
const EXPERIMENTS = 'experiments'

export interface FindingFeedback {
  id: string
  dismissed: boolean
  useful: boolean
  /** Title + evidence at the time of dismissal. If the finding later changes, it resurfaces as updated. */
  fingerprint?: string
  updatedAt: number
}

export type ExperimentTemplate = 'sleep-performance' | 'time-of-day' | 'rest-reps' | 'volume-rhr' | 'progression'

export interface Experiment {
  id: string
  template: ExperimentTemplate
  /** Free-text question as the user phrased it. */
  question: string
  /** Prospective experiments only count data from this day on; null = use all history (exploratory). */
  startDay: string | null
  createdAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore(FEEDBACK, { keyPath: 'id' })
        d.createObjectStore(EXPERIMENTS, { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

export async function getAllFeedback(): Promise<Map<string, FindingFeedback>> {
  const rows = (await (await db()).getAll(FEEDBACK)) as FindingFeedback[]
  return new Map(rows.map((r) => [r.id, r]))
}

export async function setFeedback(id: string, patch: Partial<Pick<FindingFeedback, 'dismissed' | 'useful' | 'fingerprint'>>): Promise<void> {
  const d = await db()
  const existing = ((await d.get(FEEDBACK, id)) as FindingFeedback | undefined) ?? { id, dismissed: false, useful: false, updatedAt: 0 }
  await d.put(FEEDBACK, { ...existing, ...patch, updatedAt: Date.now() })
}

export async function getExperiments(): Promise<Experiment[]> {
  return ((await (await db()).getAll(EXPERIMENTS)) as Experiment[]).sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveExperiment(e: Experiment): Promise<void> {
  await (await db()).put(EXPERIMENTS, e)
}

export async function deleteExperiment(id: string): Promise<void> {
  await (await db()).delete(EXPERIMENTS, id)
}
