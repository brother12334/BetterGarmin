import type { AnalyticsResult } from '../analytics/useAnalytics'

/**
 * Evidence-grounded assistant. Every number it may use is computed by BetterGarmin's deterministic analyses and
 * passed in as context; Gemini only explains them. Raw GarminDB files and sample streams are never sent.
 */

const SETTINGS_KEY = 'bettergarmin.assistant'
export const DEFAULT_MODEL = 'gemini-2.5-flash'

export interface AssistantSettings {
  apiKey: string
  model: string
}

export function loadSettings(): AssistantSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AssistantSettings>
    return parsed.apiKey ? { apiKey: parsed.apiKey, model: parsed.model || DEFAULT_MODEL } : null
  } catch {
    return null
  }
}

export function saveSettings(s: AssistantSettings | null): void {
  try {
    if (s) localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
    else localStorage.removeItem(SETTINGS_KEY)
  } catch {
    // storage unavailable (private mode) — the key then only lives for this page view
  }
}

/** The exact payload sent to Gemini — also shown to the user on request. */
export function buildContext(r: AnalyticsResult) {
  const { dataset: ds, recovery, findings } = r
  const daysWith = (k: 'restingHr' | 'hrv' | 'sleepMinutes' | 'steps') => ds.days.filter((d) => d[k] != null).length
  const exerciseCounts = [...ds.exerciseHistory.entries()].map(([ex, h]) => ({ exercise: ex, sessions: h.length, lastDay: h[h.length - 1]?.day })).sort((a, b) => b.sessions - a.sessions)
  return {
    period: { from: ds.firstDay, to: ds.lastDay },
    coverage: {
      daysWithRestingHr: daysWith('restingHr'),
      daysWithHrv: daysWith('hrv'),
      daysWithSleep: daysWith('sleepMinutes'),
      daysWithSteps: daysWith('steps'),
      strengthSessions: ds.sessions.length,
      sessionsWithHrTimeline: [...ds.aligned.values()].filter((a) => a.timeline && a.hrSource !== 'none').length,
    },
    exercises: exerciseCounts,
    recentSessions: ds.sessions.slice(-15).map((s) => ({
      workoutId: s.workoutId,
      day: s.day,
      title: s.title,
      workingSets: s.workingSetCount,
      volumeKg: Math.round(s.volumeKg),
      topSets: s.exercises.map((e) => ({ exercise: e.exercise, top: e.topSet ? `${e.topSet.weight}kg x ${e.topSet.reps}` : null })),
    })),
    recoveryIndicators: {
      statement: recovery.statement,
      indicators: recovery.indicators.map((i) => ({
        name: i.label,
        unit: i.unit,
        last7DayMedian: i.recent,
        usualMedian: i.baseline?.median ?? null,
        status: i.status,
        direction: i.direction,
        directionOftenLinkedToLessRecovery: i.lessRecoveredDirection,
        contextOnly: i.contextOnly,
      })),
    },
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      summary: f.summary,
      from: f.startDay,
      to: f.endDay,
      n: `${f.n} ${f.nLabel}`,
      evidence: f.evidence,
      effect: f.effectLabel,
      method: f.method || undefined,
      alternativeExplanations: f.alternatives.length ? f.alternatives : undefined,
      needsMoreData: f.needs,
    })),
  }
}

const SYSTEM = `You are the analysis assistant inside BetterGarmin, a personal training and Garmin-data app.
Answer ONLY from the JSON context you are given. It contains results already computed by deterministic code.
Rules:
- Never invent numbers, sample sizes, dates, correlations or statistical significance. Quote numbers exactly as given.
- When you use a finding, cite it as [F:<id>] using its exact id from the context.
- Respect each finding's evidence level. "insufficient" means nothing can be concluded yet: say what data is missing instead.
- Correlation is not causation: describe relationships as observed associations and mention the listed alternative explanations when relevant.
- Never diagnose illness, overtraining, hormonal status, muscle damage or "CNS fatigue". Heart rate is not a measure of muscular effort.
- If the question cannot be answered from the context, say so plainly and say what data would be needed.
- Be concise: short paragraphs or bullet points, plain language.`

export async function askGemini(settings: AssistantSettings, question: string, context: unknown, signal?: AbortSignal): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `Context (JSON):\n${JSON.stringify(context)}\n\nQuestion: ${question}` }] }],
      generationConfig: { temperature: 0.2 },
    }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
      // non-JSON error body
    }
    if (res.status === 400 && /API key/i.test(detail)) throw new Error('Gemini rejected the API key. Check it in the settings above.')
    if (res.status === 404) throw new Error(`Model "${settings.model}" wasn't found. Try ${DEFAULT_MODEL}.`)
    if (res.status === 429) throw new Error('Gemini rate limit or quota reached. Try again in a minute.')
    throw new Error(`Gemini request failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text.trim()) throw new Error('Gemini returned an empty answer (it may have been blocked by a safety filter).')
  return text
}

export type AnswerPart = { kind: 'text'; text: string } | { kind: 'cite'; id: string }

/** Splits an answer into text and citations, keeping only citations of findings that actually exist. */
export function parseAnswer(text: string, knownIds: Set<string>): AnswerPart[] {
  const parts: AnswerPart[] = []
  const re = /\[F:([^\]]+)\]/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ kind: 'text', text: text.slice(last, m.index) })
    if (knownIds.has(m[1].trim())) parts.push({ kind: 'cite', id: m[1].trim() })
    last = m.index! + m[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}
