import { useState } from 'react'
import { Card } from '../../components/ui/Card'
import { NavBar } from '../../app/NavBar'
import { NAV_STYLES, isEdgeStyle } from '../../app/navConfig'
import { updateAppearance, useAppearance, type NavStyle } from '../../app/appearance'
import { cn } from '../../lib/cn'

/** Live previews of every tab bar style. Tapping a preview's icons tries it out; "Use this" applies it. */
export function NavStylePicker() {
  const { navStyle } = useAppearance()
  return (
    <Card>
      <p className="font-semibold">Nav bar</p>
      <p className="mb-4 mt-0.5 text-xs text-[var(--text-tertiary)]">
        Tap the icons in a preview to try it, then pick the one you like. The bar at the bottom changes straight away.
      </p>
      <div className="flex flex-col gap-3">
        {NAV_STYLES.map((s) => (
          <Preview key={s.id} id={s.id} label={s.label} selected={navStyle === s.id} />
        ))}
      </div>
    </Card>
  )
}

function Preview({ id, label, selected }: { id: NavStyle; label: string; selected: boolean }) {
  const [active, setActive] = useState(0)
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-control)] border-2 transition-colors',
        selected ? 'border-[var(--accent)]' : 'border-[var(--border-panel)]',
      )}
    >
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          onClick={() => updateAppearance({ navStyle: id })}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold',
            selected ? 'bg-[var(--accent)] text-black/80' : 'bg-[var(--bg-panel)] text-[var(--text-secondary)]',
          )}
        >
          {selected ? 'In use' : 'Use this'}
        </button>
      </div>
      <div className={cn('flex justify-center bg-[var(--bg-base)]', isEdgeStyle(id) ? 'pt-8' : 'px-3 pb-4 pt-9')}>
        <NavBar variant={id} active={active} onSelect={setActive} layoutKey={`preview-${id}`} />
      </div>
    </div>
  )
}
