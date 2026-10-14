import { useMemo } from 'react'
import { getTodayPhoto } from '../../lib/dailyBackdrop'

interface MountainBackdropProps {
  height?: number
  className?: string
}

/** Today's photo for the hero backdrop — picked deterministically from a small bundled set, a different one each calendar day. */
export function MountainBackdrop({ height = 220, className }: MountainBackdropProps) {
  const photo = useMemo(() => getTodayPhoto(), [])

  return (
    <img
      src={`${import.meta.env.BASE_URL}${photo.src}`}
      alt={photo.alt}
      className={className}
      style={{ width: '100%', height: '100%', minHeight: height, objectFit: 'cover', display: 'block' }}
      loading="eager"
      fetchPriority="high"
      decoding="async"
    />
  )
}
