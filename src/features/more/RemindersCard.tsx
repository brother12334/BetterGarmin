import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { loadReminders, saveReminders, type ReminderSettings } from './reminders'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const field = 'rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2 text-base'

/** Optional workout reminder with quiet hours, and an honest note about what a web page can and can't do. */
export function RemindersCard() {
  const [s, setS] = useState<ReminderSettings>(loadReminders)
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const update = (patch: Partial<ReminderSettings>) => {
    const next = { ...s, ...patch }
    setS(next)
    saveReminders(next)
  }
  const enable = async (on: boolean) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') setPerm(await Notification.requestPermission())
    update({ enabled: on })
  }

  return (
    <Card className="flex flex-col gap-3">
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block font-semibold">Workout reminder</span>
          <span className="block text-xs text-[var(--text-tertiary)]">
            Only works while BetterGarmin is open. iPhone doesn't let web pages schedule notifications for later, so don't rely on it.
          </span>
        </span>
        <input type="checkbox" checked={s.enabled} onChange={(e) => enable(e.target.checked)} className="mt-1 h-6 w-6 accent-[var(--accent)]" aria-label="Workout reminder" />
      </label>
      {s.enabled && (
        <>
          {perm !== 'granted' && (
            <p className="text-xs text-amber-500">
              {perm === 'unsupported' ? "This browser can't show notifications here." : 'Notifications are blocked for this site, so reminders will be silent.'}
            </p>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            Time
            <input type="time" value={s.time} onChange={(e) => update({ time: e.target.value })} className={field} />
          </label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={s.days.includes(i)}
                onClick={() => update({ days: s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })}
                className={`min-h-11 flex-1 rounded-control text-sm ${s.days.includes(i) ? 'bg-[var(--accent)] text-black' : 'bg-[var(--ring-track)] text-[var(--text-secondary)]'}`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            Quiet hours
            <span className="flex items-center gap-2">
              <input type="time" aria-label="Quiet hours start" value={s.quietStart} onChange={(e) => update({ quietStart: e.target.value })} className={field} />
              to
              <input type="time" aria-label="Quiet hours end" value={s.quietEnd} onChange={(e) => update({ quietEnd: e.target.value })} className={field} />
            </span>
          </div>
        </>
      )}
      <p className="text-xs text-[var(--text-tertiary)]">
        Wake-up alarms that vibrate on the band aren't offered yet. They'd have to be stored on the band itself to work with Bluefy closed, and that hasn't
        been verified on a CIRQA. A browser timer isn't a dependable overnight alarm.
      </p>
    </Card>
  )
}
