import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { parseElement26Export } from './element26Import'
import { saveImportedWorkout } from '../../db/strengthLog'

interface ImportElement26ButtonProps {
  onImported: () => Promise<void>
}

interface ImportSummary {
  workoutId: string
  setCount: number
  replaced: boolean
  warnings: string[]
}

export function ImportElement26Button({ onImported }: ImportElement26ButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  async function handleFile(file: File) {
    setImporting(true)
    setError(null)
    setSummary(null)
    try {
      const json: unknown = JSON.parse(await file.text())
      const result = parseElement26Export(json)
      if ('error' in result) {
        setError(result.error)
        return
      }
      const { replaced } = await saveImportedWorkout(result.workout, result.sets, {
        workoutId: result.workout.id,
        source: 'element26',
        importedAt: Date.now(),
        fileName: file.name,
        raw: json,
      })
      await onImported()
      setSummary({ workoutId: result.workout.id, setCount: result.sets.length, replaced, warnings: result.warnings })
    } catch {
      setError("Couldn't read that file — make sure it's a valid Element 26 export.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={importing}>
        {importing ? 'Importing…' : 'Import Element 26 workout'}
      </Button>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {summary && (
        <div className="flex flex-col gap-1 text-xs">
          <p className="text-[var(--text-secondary)]">
            {summary.replaced ? 'Re-imported' : 'Imported'} {summary.setCount} sets.{' '}
            <Link to={`/training/strength/workout/${summary.workoutId}`} className="text-sky-400 hover:text-sky-300">
              Review timeline →
            </Link>
          </p>
          {summary.warnings.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-amber-400">
              {summary.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
