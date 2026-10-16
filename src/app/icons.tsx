import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** The Dual Orbit brand mark (matches public/icons/icon.svg). */
export function Logo({ size = 32, rounded = true, ...props }: IconProps & { size?: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" {...props}>
      <defs>
        <linearGradient id="orbitA" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="orbitB" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {rounded && <rect width="64" height="64" rx="16" fill="#0a0b0f" />}
      <circle cx="25" cy="32" r="16.5" fill="none" stroke="url(#orbitA)" strokeWidth="5.5" />
      <circle cx="39" cy="32" r="16.5" fill="none" stroke="url(#orbitB)" strokeWidth="5.5" opacity={0.92} />
    </svg>
  )
}

export function TodayIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  )
}

export function HealthIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s-7.5-4.6-10-9.1C.5 8.6 2 5 5.5 5c2 0 3.3 1.1 4 2.2.7-1.1 2-2.2 4-2.2C17 5 18.5 8.6 17 11.9 14.5 16.4 12 21 12 21z" />
      <path d="M4 12h3l2-3 2 5 2-4 1.5 2H20" />
    </svg>
  )
}

export function TrainingIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 8v8M3 10v4M19 8v8M21 10v4" />
      <path d="M5 12h14" />
      <path d="M8 6v12M16 6v12" />
    </svg>
  )
}

export function SleepIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
    </svg>
  )
}

export function InsightsIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 17l5-6 4 3 5-7 4 4" />
      <path d="M3 21h18" />
    </svg>
  )
}

export function MoreIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
    </svg>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l1.8 4.6L18 9.3l-4.2 1.7L12 15.6l-1.8-4.6L6 9.3l4.2-1.7L12 3z" />
      <path d="M19 15l.9 2.3L22 18l-2.1.7L19 21l-.9-2.3L16 18l2.1-.7L19 15z" />
    </svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

export function TrophyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H5a3 3 0 0 0 3 5M16 5h3a3 3 0 0 1-3 5" />
      <path d="M12 13v4M9 21h6M9 21c0-1.5.5-3 3-3s3 1.5 3 3" />
    </svg>
  )
}

/** Customize: three style "dials" (tracks with knobs), the middle knob a ring echoing the Dual Orbit mark. */
export function CustomizeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h9M17 6h3" />
      <path d="M4 12h3M11 12h9" />
      <path d="M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" fill="currentColor" />
      <circle cx="9" cy="12" r="2.4" />
      <circle cx="17" cy="18" r="2" fill="currentColor" />
    </svg>
  )
}
