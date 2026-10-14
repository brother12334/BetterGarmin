import { useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { parseElement26Export } from './element26Import'
import type { SetRecord, WorkoutRecord } from '../../db/strengthLog'

interface ImportElement26ButtonProps {
  onImported: (workout: WorkoutRecord, sets: SetRecord[]) => Promise<void>
}

export function ImportElement26Button({ onImported }: ImportElement26ButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  async function handleFile(file: File) {
    setImporting(true)
    setError(null)
    setWarnings([])
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const result = parseElement26Export(json)
      if ('error' in result) {
        setError(result.error)
        return
      }
      await onImported(result.workout, result.sets)
      setWarnings(result.warnings)
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
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-amber-400">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
