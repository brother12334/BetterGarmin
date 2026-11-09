import { GripIcon } from '../../app/icons'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Reorder, useDragControls } from 'framer-motion'
import { cn } from '../../lib/cn'
import { TODAY_WIDGETS, resetAppearance, updateAppearance, useAppearance, type WidgetSlot } from '../../app/appearance'

/** Rearrange Today: the order of the Today screen's widgets and which ones show. The look itself is fixed. */
export function CustomizePage() {
  const a = useAppearance()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Rearrange Today</h1>
          <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">Drag to reorder, switch off what you don't need. Saved on this phone.</p>
        </div>
        <Link to="/more" className="shrink-0 rounded-full bg-[var(--text-primary)] px-4 py-2 text-sm font-bold text-[var(--bg-base)]">
          Done
        </Link>
      </div>

      <Reorder.Group axis="y" values={a.todayLayout} onReorder={(todayLayout) => updateAppearance({ todayLayout })} className="flex flex-col gap-2">
        {a.todayLayout.map((slot) => (
          <LayoutRow key={slot.id} slot={slot} layout={a.todayLayout} />
        ))}
      </Reorder.Group>

      <div className="mt-2 flex items-center gap-2">
        {confirmReset ? (
          <>
            <button
              type="button"
              onClick={() => {
                resetAppearance()
                setConfirmReset(false)
              }}
              className="rounded-full bg-[var(--tone-red)] px-5 py-2.5 text-sm font-bold text-white"
            >
              Yes, reset the order
            </button>
            <button type="button" onClick={() => setConfirmReset(false)} className="rounded-full px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)]">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)} className="rounded-full bg-[var(--bg-panel)] px-5 py-2.5 text-sm font-bold">
            Reset to the default order
          </button>
        )}
      </div>
    </div>
  )
}

/** One widget as a block: drag handle, name, move up/down, and a show/hide switch. Hidden ones fade. */
function LayoutRow({ slot, layout }: { slot: WidgetSlot; layout: WidgetSlot[] }) {
  const controls = useDragControls()
  const label = TODAY_WIDGETS.find((w) => w.id === slot.id)?.label ?? slot.id
  const index = layout.indexOf(slot)
  const move = (delta: number) => {
    const next = [...layout]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    updateAppearance({ todayLayout: next })
  }
  return (
    <Reorder.Item
      value={slot}
      dragListener={false}
      dragControls={controls}
      className={cn('flex items-center gap-2 rounded-card bg-[var(--bg-elevated)] px-3 py-3.5 transition-opacity', !slot.visible && 'opacity-55')}
    >
      <button aria-label={`Drag ${label}`} onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none p-1.5 text-[var(--text-tertiary)] active:cursor-grabbing">
        <GripIcon width={18} height={18} />
      </button>
      <span className="flex-1 text-base font-extrabold leading-tight">{label}</span>
      <button aria-label="Move up" disabled={index === 0} onClick={() => move(-1)} className="h-9 w-9 rounded-full bg-[var(--bg-panel)] font-bold disabled:opacity-30">
        ↑
      </button>
      <button aria-label="Move down" disabled={index === layout.length - 1} onClick={() => move(1)} className="h-9 w-9 rounded-full bg-[var(--bg-panel)] font-bold disabled:opacity-30">
        ↓
      </button>
      <button
        role="switch"
        aria-checked={slot.visible}
        aria-label={`Show ${label}`}
        onClick={() => updateAppearance({ todayLayout: layout.map((s) => (s.id === slot.id ? { ...s, visible: !s.visible } : s)) })}
        className={cn('relative ml-1 h-7 w-12 shrink-0 rounded-full transition-colors', slot.visible ? 'bg-[var(--accent)]' : 'bg-[var(--ring-track)]')}
      >
        <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white transition-all', slot.visible ? 'left-6' : 'left-1')} />
      </button>
    </Reorder.Item>
  )
}
