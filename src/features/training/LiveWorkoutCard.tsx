import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useBand } from '../../lib/band/bandStore'
import { CommandStage } from '../band/CommandStage'
import {
  discardLiveWorkout,
  elapsedMs,
  finishLiveWorkout,
  linkBandToLiveWorkout,
  pauseLiveWorkout,
  resumeLiveWorkout,
  startLiveWorkout,
  useLiveWorkout,
  type FinishedWorkout,
} from './liveWorkout'

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * Runs a workout live in BetterGarmin. With the band connected it starts, pauses, resumes and saves a matching
 * Strength activity on the band; without it, the workout still runs and logs normally.
 */
export function LiveWorkoutCard({ onFinished }: { onFinished: (w: FinishedWorkout, bandActivityUuid: string | null) => void }) {
  const w = useLiveWorkout()
  const b = useBand()
  const [, tick] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  useEffect(() => {
    if (w.status !== 'active') return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [w.status])

  const bandReady = b.state === 'ready'
  const cmd = b.activity.command

  if (w.status === 'idle') {
    return (
      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Start a workout</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {bandReady ? 'Your band will start a Strength activity too.' : (
              <>
                Times it in BetterGarmin. <Link to="/more" className="text-sky-400">Connect your band</Link> to start a Strength activity on it as well.
              </>
            )}
          </p>
        </div>
        <Button onClick={startLiveWorkout}>Start</Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 border-[var(--accent)]/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)]">{w.status === 'paused' ? 'Paused' : 'Workout in progress'}</p>
          <p className="text-4xl font-extrabold tabular-nums">{clock(elapsedMs(w))}</p>
        </div>
        <div className="flex flex-col gap-2">
          {w.status === 'active' ? (
            <Button variant="secondary" onClick={pauseLiveWorkout}>
              Pause
            </Button>
          ) : (
            <Button variant="secondary" onClick={resumeLiveWorkout}>
              Resume
            </Button>
          )}
          <Button
            onClick={() => {
              const uuid = b.activity.uuid
              const done = finishLiveWorkout()
              if (done) onFinished(done, done.bandLinked ? uuid : null)
            }}
          >
            Finish
          </Button>
        </div>
      </div>

      {w.bandLinked && cmd && <CommandStage status={cmd} />}
      {w.bandLinked && b.activity.uuid && <p className="text-[11px] text-[var(--text-tertiary)]">Band activity {b.activity.uuid}</p>}
      {w.bandLinked && !bandReady && (
        <p className="text-xs text-amber-400">The band disconnected. Your workout keeps running here; reconnect on the More page to keep it in step.</p>
      )}
      {!w.bandLinked && bandReady && (
        <button className="self-start text-xs text-sky-400 underline" onClick={linkBandToLiveWorkout}>
          Start a Strength activity on the band too
        </button>
      )}

      {confirmDiscard ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--text-secondary)]">
            Discard this workout{w.bandLinked ? ' and the band activity' : ''}? This can't be undone.
          </span>
          <Button
            variant="secondary"
            className="border-rose-500/40 text-rose-400"
            onClick={() => {
              discardLiveWorkout()
              setConfirmDiscard(false)
            }}
          >
            Discard
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <button className="self-start text-xs text-[var(--text-tertiary)] underline" onClick={() => setConfirmDiscard(true)}>
          Discard workout
        </button>
      )}
    </Card>
  )
}
