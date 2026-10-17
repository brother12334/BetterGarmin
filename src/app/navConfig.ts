import type { ComponentType, SVGProps } from 'react'
import { HealthIcon, InsightsIcon, MoreIcon, SleepIcon, TodayIcon, TrainingIcon } from './icons'

export const TABS: { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: '/', label: 'Today', icon: TodayIcon },
  { to: '/health', label: 'Health', icon: HealthIcon },
  { to: '/training', label: 'Training', icon: TrainingIcon },
  { to: '/sleep', label: 'Sleep', icon: SleepIcon },
  { to: '/insights', label: 'Insights', icon: InsightsIcon },
  { to: '/more', label: 'More', icon: MoreIcon },
]
