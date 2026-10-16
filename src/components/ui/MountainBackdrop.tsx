import { useMemo } from 'react'
import { getTodayPhoto } from '../../lib/dailyBackdrop'
import { GRADIENTS, useAppearance, useCustomPhoto } from '../../app/appearance'

interface MountainBackdropProps {
  height?: number
  className?: string
}

/**
 * The backdrop chosen in Customize: today's rotating photo (default), a fixed bundled photo, the user's own
 * photo, or a gradient, with the chosen dim and blur applied.
 */
export function MountainBackdrop({ height = 220, className }: MountainBackdropProps) {
  const a = useAppearance()
  const custom = useCustomPhoto()
  const daily = useMemo(() => getTodayPhoto(), [])

  const filter = a.blur > 0 ? `blur(${a.blur}px)` : undefined
  // Blur pulls transparent edges in; scale slightly so the edges stay covered.
  const transform = a.blur > 0 ? `scale(${1 + a.blur / 120})` : undefined
  const style = { width: '100%', height: '100%', minHeight: height, display: 'block', filter, transform } as const

  let content
  if (a.backgroundMode === 'gradient') {
    content = <div className={className} style={{ ...style, background: GRADIENTS[a.gradient]?.css ?? GRADIENTS.aurora.css }} />
  } else {
    const src =
      a.backgroundMode === 'custom' && custom
        ? custom
        : `${import.meta.env.BASE_URL}${a.backgroundMode === 'photo' ? a.photo : daily.src}`
    content = (
      <img
        src={src}
        alt=""
        className={className}
        style={{ ...style, objectFit: 'cover' }}
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {content}
      {a.dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: a.dim / 100 }} />}
    </div>
  )
}

/** Fixed full-screen backdrop behind every screen, when "Use on every screen" is on. */
export function PageBackdrop() {
  const a = useAppearance()
  if (!a.fullPage) return null
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      <MountainBackdrop height={0} />
    </div>
  )
}
