import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { UploadIcon, CheckIcon } from '../../app/icons'
import { useData, describeKind } from '../../app/DataProvider'
import { cn } from '../../lib/cn'

export function DropZone() {
  const { loadFiles, loadedKinds } = useData()
  const [isDragging, setIsDragging] = useState(false)
  const [unrecognized, setUnrecognized] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      setLoading(true)
      try {
        const files = Array.from(fileList).filter((f) => f.name.endsWith('.db'))
        const result = await loadFiles(files)
        setUnrecognized(result.unrecognized)
      } finally {
        setLoading(false)
      }
    },
    [loadFiles],
  )

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        'flex flex-col items-center gap-3 border-2 border-dashed p-8 text-center transition-colors',
        isDragging ? 'border-sky-400 bg-sky-400/5' : 'border-[var(--border-panel)]',
      )}
    >
      <motion.div
        animate={isDragging ? { scale: 1.08 } : { scale: 1 }}
        className="flex h-14 w-14 items-center justify-center rounded-control bg-[var(--bg-panel)] text-[var(--accent)]"
      >
        <UploadIcon width={26} height={26} />
      </motion.div>
      <div>
        <p className="font-semibold text-[var(--text-primary)]">Drop your GarminDB files here</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          From <code className="rounded-full bg-black/30 px-1 py-1 text-xs">~/HealthData/DBs</code> — drag in the whole folder, or
          pick files below.
        </p>
      </div>
      <Button loading={loading} type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={loading}>
        {loading ? 'Loading…' : 'Choose files'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".db"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {loadedKinds.length > 0 && (
        <div className="mt-2 flex w-full flex-col gap-2 text-left">
          {loadedKinds.map((kind) => (
            <div key={kind} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <CheckIcon width={15} height={15} className="text-emerald-400" />
              {describeKind(kind)}
            </div>
          ))}
        </div>
      )}
      {unrecognized.length > 0 && (
        <p className="text-sm text-amber-400">
          Didn't recognize: {unrecognized.join(', ')}. Make sure these are unmodified GarminDB `.db` files.
        </p>
      )}
    </Card>
  )
}
