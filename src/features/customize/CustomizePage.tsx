import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Reorder, useDragControls } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { MountainBackdrop } from '../../components/ui/MountainBackdrop'
import { cn } from '../../lib/cn'
import { useTheme } from '../../app/theme'
import {
  ACCENTS,
  GRADIENTS,
  PHOTOS,
  PRESETS,
  TODAY_WIDGETS,
  resetAppearance,
  setCustomPhoto,
  updateAppearance,
  useAppearance,
  useCustomPhoto,
  type Appearance,
  type WidgetSlot,
} from '../../app/appearance'

export function CustomizePage() {
  const a = useAppearance()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customize</h1>
          <p className="text-sm text-[var(--text-secondary)]">Changes apply instantly and are saved in this browser.</p>
        </div>
        <Link to="/more" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          Done
        </Link>
      </div>

      <LivePreview />

      <Section title="Themes" hint="One tap sets accent, cards, corners, font and background together.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <PresetTile key={p.name} name={p.name} patch={p.patch} />
          ))}
        </div>
      </Section>

      <BackgroundSection />

      <Section title="Today layout" hint="Drag the handle to reorder. Switch off anything you don't want to see.">
        <LayoutEditor layout={a.todayLayout} />
      </Section>

      <StyleSection />

      <Card>
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="border-rose-500/40 text-rose-400"
              onClick={() => {
                resetAppearance()
                setConfirmReset(false)
              }}
            >
              Yes, reset everything
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            Reset to default look
          </Button>
        )}
      </Card>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <p className="font-semibold">{title}</p>
      {hint && <p className="mb-4 mt-0.5 text-xs text-[var(--text-tertiary)]">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </Card>
  )
}

/** A miniature of the current look: backdrop, a card and a button. */
function LivePreview() {
  return (
    <div className="relative h-44 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-panel)]">
      <div className="absolute inset-0">
        <MountainBackdrop height={176} />
      </div>
      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
        <div className="glass-panel rounded-[var(--radius-card)] px-4 py-3">
          <p className="text-[11px] font-medium text-[var(--text-tertiary)]">Steps</p>
          <p className="text-xl font-bold tabular-nums">8,432</p>
        </div>
        <Button tabIndex={-1}>Sync now</Button>
      </div>
    </div>
  )
}

function PresetTile({ name, patch }: { name: string; patch: Partial<Appearance> }) {
  const bg =
    patch.backgroundMode === 'gradient'
      ? GRADIENTS[patch.gradient ?? 'aurora'].css
      : patch.backgroundMode === 'photo'
        ? `center / cover url(${import.meta.env.BASE_URL}${patch.photo})`
        : `center / cover url(${import.meta.env.BASE_URL}${PHOTOS[0].src})`
  return (
    <button
      onClick={() => updateAppearance(patch)}
      className="group relative h-20 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-panel)] text-left transition-transform active:scale-[0.97]"
      style={{ background: bg }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <span className="absolute bottom-2 left-2.5 flex items-center gap-1.5 text-sm font-semibold text-white">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: patch.accent }} />
        {name}
      </span>
    </button>
  )
}

function BackgroundSection() {
  const a = useAppearance()
  const custom = useCustomPhoto()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const base = import.meta.env.BASE_URL

  const tile = (active: boolean) =>
    cn(
      'relative aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] border-2 transition-transform active:scale-[0.97]',
      active ? 'border-[var(--accent)]' : 'border-transparent',
    )

  return (
    <Section title="Background">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <button className={tile(a.backgroundMode === 'daily')} onClick={() => updateAppearance({ backgroundMode: 'daily' })}>
          <div className="grid h-full w-full grid-cols-2">
            {PHOTOS.slice(0, 4).map((p) => (
              <img key={p.src} src={`${base}${p.src}`} alt="" className="h-full w-full object-cover" />
            ))}
          </div>
          <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-[11px] font-semibold text-white">Changes daily</span>
        </button>

        {PHOTOS.map((p) => (
          <button
            key={p.src}
            className={tile(a.backgroundMode === 'photo' && a.photo === p.src)}
            onClick={() => updateAppearance({ backgroundMode: 'photo', photo: p.src })}
            aria-label={p.label}
          >
            <img src={`${base}${p.src}`} alt="" className="h-full w-full object-cover" />
          </button>
        ))}

        {Object.entries(GRADIENTS).map(([key, g]) => (
          <button
            key={key}
            className={tile(a.backgroundMode === 'gradient' && a.gradient === key)}
            onClick={() => updateAppearance({ backgroundMode: 'gradient', gradient: key })}
            style={{ background: g.css }}
          >
            <span className="absolute bottom-1 left-1.5 text-[11px] font-semibold text-white/90">{g.label}</span>
          </button>
        ))}

        <button
          className={cn(tile(a.backgroundMode === 'custom'), 'flex items-center justify-center bg-[var(--bg-panel)]')}
          onClick={() => (custom && a.backgroundMode !== 'custom' ? updateAppearance({ backgroundMode: 'custom' }) : fileRef.current?.click())}
        >
          {custom ? (
            <img src={custom} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="text-2xl text-[var(--text-tertiary)]">+</span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-[11px] font-semibold text-white">Your photo</span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setError(null)
          try {
            await setCustomPhoto(file)
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }}
      />
      {custom && (
        <button className="mt-2 text-xs text-[var(--text-tertiary)] underline" onClick={() => fileRef.current?.click()}>
          Choose a different photo
        </button>
      )}
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

      <div className="mt-5 flex flex-col gap-4">
        <Slider label="Dim" value={a.dim} min={0} max={80} unit="%" onChange={(dim) => updateAppearance({ dim })} />
        <Slider label="Blur" value={a.blur} min={0} max={24} unit="px" onChange={(blur) => updateAppearance({ blur })} />
        <Toggle
          label="Use on every screen"
          hint="Puts the background behind the whole app, not just the top of Today."
          checked={a.fullPage}
          onChange={(fullPage) => updateAppearance({ fullPage })}
        />
      </div>
    </Section>
  )
}

function LayoutEditor({ layout }: { layout: WidgetSlot[] }) {
  return (
    <Reorder.Group axis="y" values={layout} onReorder={(todayLayout) => updateAppearance({ todayLayout })} className="flex flex-col gap-2">
      {layout.map((slot) => (
        <LayoutRow key={slot.id} slot={slot} layout={layout} />
      ))}
    </Reorder.Group>
  )
}

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
      className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border-panel)] bg-[var(--bg-elevated)] px-3 py-2.5"
    >
      <button
        aria-label={`Drag ${label}`}
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none px-1 text-lg leading-none text-[var(--text-tertiary)] active:cursor-grabbing"
      >
        ⠿
      </button>
      <span className={cn('flex-1 text-sm', !slot.visible && 'text-[var(--text-tertiary)] line-through')}>{label}</span>
      <button aria-label="Move up" disabled={index === 0} onClick={() => move(-1)} className="px-1.5 text-[var(--text-tertiary)] disabled:opacity-30">
        ↑
      </button>
      <button
        aria-label="Move down"
        disabled={index === layout.length - 1}
        onClick={() => move(1)}
        className="px-1.5 text-[var(--text-tertiary)] disabled:opacity-30"
      >
        ↓
      </button>
      <Switch
        checked={slot.visible}
        onChange={(visible) => updateAppearance({ todayLayout: layout.map((s) => (s.id === slot.id ? { ...s, visible } : s)) })}
        label={`Show ${label}`}
      />
    </Reorder.Item>
  )
}

function StyleSection() {
  const a = useAppearance()
  const { theme, setTheme } = useTheme()
  return (
    <Section title="Style">
      <div className="flex flex-col gap-5">
        <Field label="Accent colour">
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                aria-label={`Accent ${c}`}
                onClick={() => updateAppearance({ accent: c })}
                className={cn('h-8 w-8 rounded-full border-2 transition-transform active:scale-90', a.accent === c ? 'border-[var(--text-primary)]' : 'border-transparent')}
                style={{ background: c }}
              />
            ))}
            <label className="relative h-8 w-8 overflow-hidden rounded-full border border-dashed border-[var(--text-tertiary)]" title="Custom colour">
              <input
                type="color"
                value={a.accent}
                onChange={(e) => updateAppearance({ accent: e.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <span className="flex h-full items-center justify-center text-xs text-[var(--text-tertiary)]">+</span>
            </label>
          </div>
        </Field>
        <Field label="Theme">
          <Segmented value={theme} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'Auto']]} onChange={setTheme} />
        </Field>
        <Field label="Cards">
          <Segmented
            value={a.cardStyle}
            options={[['glass', 'Glass'], ['solid', 'Solid'], ['outline', 'Outline']]}
            onChange={(cardStyle) => updateAppearance({ cardStyle })}
          />
        </Field>
        <Field label="Corners">
          <Segmented
            value={a.radius}
            options={[['sharp', 'Sharp'], ['rounded', 'Rounded'], ['round', 'Round']]}
            onChange={(radius) => updateAppearance({ radius })}
          />
        </Field>
        <Field label="Font">
          <Segmented
            value={a.font}
            options={[['manrope', 'Manrope'], ['system', 'System'], ['serif', 'Serif'], ['mono', 'Mono']]}
            onChange={(font) => updateAppearance({ font })}
          />
        </Field>
        <Field label="Density">
          <Segmented
            value={a.density}
            options={[['compact', 'Compact'], ['comfortable', 'Normal'], ['spacious', 'Large']]}
            onChange={(density) => updateAppearance({ density })}
          />
        </Field>
      </div>
    </Section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-[var(--radius-control)] border border-[var(--border-panel)] bg-[var(--bg-panel)] p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'flex-1 rounded-[calc(var(--radius-control)-4px)] px-2 py-1.5 text-xs font-semibold transition-colors',
            value === v ? 'bg-[var(--accent)] text-black/85' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between text-xs font-medium text-[var(--text-secondary)]">
        {label}
        <span className="tabular-nums text-[var(--text-tertiary)]">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </label>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-[var(--accent)]' : 'bg-[var(--ring-track)]')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}
