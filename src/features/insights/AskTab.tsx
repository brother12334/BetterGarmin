import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import type { AnalyticsResult } from '../analytics/useAnalytics'
import { askGemini, buildContext, DEFAULT_MODEL, loadSettings, parseAnswer, saveSettings, type AssistantSettings } from './assistant'

const EXAMPLES = [
  'What has changed in my training over the past three months?',
  'Which exercises show the most consistent improvement?',
  'What patterns are there between my sleep and performance?',
  'Are any of my recovery indicators unusual right now?',
  'Which questions do I not have enough data for yet?',
]

interface Turn {
  question: string
  answer?: string
  error?: string
}

export function AskTab({ result }: { result: AnalyticsResult }) {
  const [settings, setSettings] = useState<AssistantSettings | null>(() => loadSettings())
  const [keyDraft, setKeyDraft] = useState('')
  const [modelDraft, setModelDraft] = useState(settings?.model ?? DEFAULT_MODEL)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const context = useMemo(() => buildContext(result), [result])
  const titles = useMemo(() => new Map(result.findings.map((f) => [f.id, f.title])), [result])
  const knownIds = useMemo(() => new Set(titles.keys()), [titles])

  const ask = async (q: string) => {
    if (!settings || !q.trim() || busy) return
    setBusy(true)
    setQuestion('')
    setTurns((t) => [...t, { question: q }])
    abortRef.current = new AbortController()
    try {
      const answer = await askGemini(settings, q, context, abortRef.current.signal)
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer } : x)))
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Request failed'
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error } : x)))
    } finally {
      setBusy(false)
    }
  }

  if (!settings) {
    return (
      <Card>
        <p className="font-semibold">Ask about your data</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Uses Google Gemini with your own API key. BetterGarmin does the maths; Gemini only explains the computed results and links back to
          them. What gets sent: your findings, recovery indicators, data coverage and summaries of your recent sessions — never your Garmin
          files or heart-rate streams. The key is stored only in this browser.
        </p>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <input
            type="password"
            placeholder="Gemini API key"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            className="rounded-xl border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2"
            autoComplete="off"
          />
          <input value={modelDraft} onChange={(e) => setModelDraft(e.target.value)} className="rounded-xl border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2 text-xs" aria-label="Model" />
          <div className="flex items-center gap-3">
            <Button
              disabled={!keyDraft.trim()}
              onClick={() => {
                const s = { apiKey: keyDraft.trim(), model: modelDraft.trim() || DEFAULT_MODEL }
                saveSettings(s)
                setSettings(s)
                setKeyDraft('')
              }}
            >
              Save key
            </Button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:text-sky-300">
              Get a key in Google AI Studio →
            </a>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {turns.length === 0 && (
        <Card>
          <p className="mb-2 font-semibold">Ask about your data</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} className="rounded-full border border-[var(--border-panel)] px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                {q}
              </button>
            ))}
          </div>
        </Card>
      )}

      {turns.map((t, i) => (
        <div key={i} className="flex flex-col gap-2">
          <p className="self-end rounded-2xl bg-sky-500/15 px-3 py-2 text-sm">{t.question}</p>
          <Card className="text-sm leading-relaxed">
            {t.error ? (
              <p className="text-rose-400">{t.error}</p>
            ) : t.answer ? (
              <Answer text={t.answer} knownIds={knownIds} titles={titles} />
            ) : (
              <p className="animate-pulse text-[var(--text-tertiary)]">Thinking…</p>
            )}
          </Card>
        </div>
      ))}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          ask(question)
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your training, sleep or recovery…"
          className="min-w-0 flex-1 rounded-2xl border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2.5 text-sm"
        />
        <Button type="submit" disabled={busy || !question.trim()}>
          Ask
        </Button>
      </form>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
        <span>Numbers come from BetterGarmin's calculations; the wording is Gemini's. Check the linked findings.</span>
        <button type="button" className="hover:text-[var(--text-primary)]" onClick={() => setShowContext((v) => !v)}>
          {showContext ? 'Hide' : 'Show'} exactly what is sent
        </button>
        <button
          type="button"
          className="hover:text-rose-400"
          onClick={() => {
            saveSettings(null)
            setSettings(null)
            setTurns([])
          }}
        >
          Forget API key
        </button>
      </div>
      {showContext && <pre className="max-h-80 overflow-auto rounded-2xl bg-[var(--bg-panel)] p-3 text-[11px]">{JSON.stringify(context, null, 2)}</pre>}
    </div>
  )
}

function Answer({ text, knownIds, titles }: { text: string; knownIds: Set<string>; titles: Map<string, string> }) {
  const parts = parseAnswer(text, knownIds)
  return (
    <div className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.text.replace(/\*\*(.+?)\*\*/g, '$1')}</span>
        ) : (
          <Link key={i} to={`/insights?tab=findings#finding-${encodeURIComponent(p.id)}`} title={titles.get(p.id)} className="mx-0.5 rounded bg-sky-500/15 px-1 text-xs text-sky-400 hover:text-sky-300">
            ↗ {titles.get(p.id)?.slice(0, 40)}
          </Link>
        ),
      )}
    </div>
  )
}
