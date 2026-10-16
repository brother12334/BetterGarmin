import type { ComponentType, SVGProps } from 'react'
import type { NavStyle } from './appearance'
import { HealthIcon, InsightsIcon, MoreIcon, SleepIcon, TodayIcon, TrainingIcon } from './icons'

export const TABS: { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: '/', label: 'Today', icon: TodayIcon },
  { to: '/health', label: 'Health', icon: HealthIcon },
  { to: '/training', label: 'Training', icon: TrainingIcon },
  { to: '/sleep', label: 'Sleep', icon: SleepIcon },
  { to: '/insights', label: 'Insights', icon: InsightsIcon },
  { to: '/more', label: 'More', icon: MoreIcon },
]

export const NAV_STYLES: { id: NavStyle; label: string }[] = [
  { id: 'pill', label: 'Pill' },
  { id: 'expand', label: 'Expanding label' },
  { id: 'dock', label: 'Dock' },
  { id: 'classic', label: 'Classic' },
  { id: 'bubbles', label: 'Bubbles' },
  { id: 'notch', label: 'Notch' },
  { id: 'line', label: 'Top line' },
  { id: 'glass', label: 'Glass capsule' },
  { id: 'center', label: 'Center button' },
  { id: 'minimal', label: 'Minimal glow' },
]

/** Whether a style spans the full screen width (flush to the bottom edge) rather than floating. */
export function isEdgeStyle(variant: NavStyle): boolean {
  return variant === 'classic' || variant === 'line'
}
