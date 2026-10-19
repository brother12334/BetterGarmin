import { GripIcon } from '../../app/icons'
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
  BACKGROUND_GRADIENTS,
  BACKGROUND_PHOTOS,
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

      <Section title="Presets" hint="Pick a look. You can still change the background below.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((p) => (
            <PresetTile key={p.name} name={p.name} patch={p.patch} active={matchesPreset(a, p.patch)} />
          ))}
        </div>
      </Section>

      <BackgroundSection />

      <StyleSection />

      <Section title="Today layout" hint="Drag the handle to reorder. Switch off anything you don't want to see.">
        <LayoutEditor layout={a.todayLayout} />
      </Section>

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
      {hint && <p className="mb-4 mt-1 text-xs text-[var(--text-tertiary)]">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </Card>
  )
}

/** A miniature of the current look: backdrop, a card and a button. */
function LivePreview() {
  return (
    <div className="relative h-44 overflow-hidden rounded-card border border-[var(--border-panel)]">
      <div className="absolute inset-0">
        <MountainBackdrop height={176} />
      </div>
      <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
        <div className="glass-panel rounded-card px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-tertiary)]">Steps</p>
          <p className="text-xl font-bold tabular-nums">8,432</p>
        </div>
        <Button tabIndex={-1}>Sync now</Button>
      </div>
    </div>
  )
}

function matchesPreset(a: Appearance, patch: Partial<Appearance>): boolean {
  return (Object.keys(patch) as (keyof Appearance)[]).every((k) => a[k] === patch[k])
}

function PresetTile({ name, patch, active }: { name: string; patch: Partial<Appearance>; active: boolean }) {
  const bg =
    patch.backgroundMode === 'gradient'
      ? GRADIENTS[patch.gradient ?? 'aurora'].css
      : patch.backgroundMode === 'photo'
        ? `center / cover url(${import.meta.env.BASE_URL}${patch.photo})`
        : `center / cover url(${import.meta.env.BASE_URL}${PHOTOS[0].src})`
  return (
    <button
      onClick={() => updateAppearance(patch)}
      className={cn(
        'group relative h-24 overflow-hidden rounded-control border-2 text-left transition-transform active:opacity-80',
        active ? 'border-[var(--accent)]' : 'border-transparent',
      )}
      style={{ background: bg }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <span className="absolute bottom-2 left-2.5 flex items-center gap-2 text-sm font-semibold text-white">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: patch.accent }} />
        {name}
      </span>
    </button>
  )
}

const DARKNESS: [string, number][] = [
  ['Light', 10],
  ['Medium', 30],
  ['Dark', 55],
]

function BackgroundSection() {
  const a = useAppearance()
  const custom = useCustomPhoto()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const base = import.meta.env.BASE_URL
  const darkness = DARKNESS.reduce((best, d) => (Math.abs(d[1] - a.dim) < Math.abs(best[1] - a.dim) ? d : best))[0]

  const tile = (active: boolean) =>
    cn(
      'relative aspect-square overflow-hidden rounded-control border-2 transition-transform active:opacity-80',
      active ? 'border-[var(--accent)]' : 'border-transparent',
    )

  return (
    <Section title="Background">
      <div className="grid grid-cols-5 gap-2">
        <button className={tile(a.backgroundMode === 'daily')} onClick={() => updateAppearance({ backgroundMode: 'daily' })} aria-label="Changes daily">
          <div className="grid h-full w-full grid-cols-2">
            {PHOTOS.slice(0, 4).map((p) => (
              <img key={p.src} src={`${base}${p.src}`} alt="" className="h-full w-full object-cover" />
            ))}
          </div>
          <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-xs font-semibold text-white">Daily</span>
        </button>

        {BACKGROUND_PHOTOS.map((src) => (
          <button
            key={src}
            className={tile(a.backgroundMode === 'photo' && a.photo === src)}
            onClick={() => updateAppearance({ backgroundMode: 'photo', photo: src })}
            aria-label={PHOTOS.find((p) => p.src === src)?.label}
          >
            <img src={`${base}${src}`} alt="" className="h-full w-full object-cover" />
          </button>
        ))}

        {BACKGROUND_GRADIENTS.map((key) => (
          <button
            key={key}
            className={tile(a.backgroundMode === 'gradient' && a.gradient === key)}
            onClick={() => updateAppearance({ backgroundMode: 'gradient', gradient: key })}
            style={{ background: GRADIENTS[key].css }}
            aria-label={GRADIENTS[key].label}
          />
        ))}

        <button
          className={cn(tile(a.backgroundMode === 'custom'), 'flex items-center justify-center bg-[var(--bg-panel)]')}
          onClick={() => (custom && a.backgroundMode !== 'custom' ? updateAppearance({ backgroundMode: 'custom' }) : fileRef.current?.click())}
          aria-label="Your photo"
        >
          {custom ? (
            <img src={custom} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="text-2xl text-[var(--text-tertiary)]">+</span>
          )}
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
        <Field label="Darkness">
          <Segmented
            value={darkness}
            options={DARKNESS.map(([l]) => [l, l] as [string, string])}
            onChange={(l) =>
              updateAppearance({
                dim: DARKNESS.find((d) => d[0] === l)![1],
                blur: 0,
              })
            }
          />
        </Field>
        {a.cardStyle !== 'liquid' && (
          <Toggle
            label="Use on every screen"
            hint="Otherwise it only shows at the top of Today."
            checked={a.fullPage}
            onChange={(fullPage) => updateAppearance({ fullPage })}
          />
        )}
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
      className="flex items-center gap-3 rounded-control border border-[var(--border-panel)] bg-[var(--bg-elevated)] px-3 py-3"
    >
      <button
        aria-label={`Drag ${label}`}
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none px-1 text-lg leading-none text-[var(--text-tertiary)] active:cursor-grabbing"
      >
        <GripIcon width={16} height={16} />
      </button>
      <span className={cn('flex-1 text-sm', !slot.visible && 'text-[var(--text-tertiary)] line-through')}>{label}</span>
      <button aria-label="Move up" disabled={index === 0} onClick={() => move(-1)} className="px-2 text-[var(--text-tertiary)] disabled:opacity-30">
        ↑
      </button>
      <button
        aria-label="Move down"
        disabled={index === layout.length - 1}
        onClick={() => move(1)}
        className="px-2 text-[var(--text-tertiary)] disabled:opacity-30"
      >
        ↓
      </button>
      <Switch
        checked={slot.visible}
        onChange={(visible) =>
          updateAppearance({
            todayLayout: layout.map((s) => (s.id === slot.id ? { ...s, visible } : s)),
          })
        }
        label={`Show ${label}`}
      />
    </Reorder.Item>
  )
}

function StyleSection() {
  const a = useAppearance()
  const { theme, setTheme } = useTheme()
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
          More style options
          <span className="text-[var(--text-tertiary)] transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="mt-4 flex flex-col gap-5">
          <Field label="Accent colour">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  aria-label={`Accent ${c}`}
                  onClick={() => updateAppearance({ accent: c })}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition-transform active:opacity-80',
                    a.accent === c ? 'border-[var(--text-primary)]' : 'border-transparent',
                  )}
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
            <Segmented
              value={theme}
              options={[
                ['dark', 'Dark'],
                ['light', 'Light'],
                ['system', 'Auto'],
              ]}
              onChange={setTheme}
            />
          </Field>
          <Field label="Cards">
            <Segmented
              value={a.cardStyle}
              options={[
                ['glass', 'Glass'],
                ['liquid', 'Liquid'],
                ['solid', 'Solid'],
                ['outline', 'Outline'],
              ]}
              onChange={(cardStyle) => updateAppearance({ cardStyle })}
            />
          </Field>
          {a.cardStyle === 'liquid' && (
            <Field label="Glass">
              <Segmented
                value={a.glassTint}
                options={[
                  ['clear', 'Clear'],
                  ['dark', 'Dark'],
                ]}
                onChange={(glassTint) => updateAppearance({ glassTint })}
              />
            </Field>
          )}
          <Field label="Corners">
            <Segmented
              value={a.radius}
              options={[
                ['sharp', 'Sharp'],
                ['rounded', 'Rounded'],
                ['round', 'Round'],
              ]}
              onChange={(radius) => updateAppearance({ radius })}
            />
          </Field>
          <Field label="Font">
            <Segmented
              value={a.font}
              options={[
                ['manrope', 'Manrope'],
                ['system', 'System'],
                ['serif', 'Serif'],
                ['mono', 'Mono'],
              ]}
              onChange={(font) => updateAppearance({ font })}
            />
          </Field>
          <Field label="Density">
            <Segmented
              value={a.density}
              options={[
                ['compact', 'Compact'],
                ['comfortable', 'Normal'],
                ['spacious', 'Large'],
              ]}
              onChange={(density) => updateAppearance({ density })}
            />
          </Field>
          <Field label="Chart style">
            <Segmented
              value={a.chartStyle}
              options={[
                ['smooth', 'Smooth'],
                ['blocks', 'Blocks'],
                ['detailed', 'Detailed'],
              ]}
              onChange={(chartStyle) => updateAppearance({ chartStyle })}
            />
          </Field>
        </div>
      </details>
    </Card>
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
    <div className="flex rounded-control border border-[var(--border-panel)] bg-[var(--bg-panel)] p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'flex-1 rounded-[calc(var(--radius-control)-4px)] px-2 py-2 text-xs font-semibold transition-colors',
            value === v ? 'bg-[var(--accent)] text-black/85' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
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
