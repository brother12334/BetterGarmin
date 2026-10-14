import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

interface StatNumberProps {
  value: number
  decimals?: number
  durationMs?: number
  className?: string
  suffix?: string
  prefix?: string
}

/** Animates from 0 (or the previous value) up to `value` on change. */
export function StatNumber({ value, decimals = 0, durationMs = 900, className, suffix, prefix }: StatNumberProps) {
  const [display, setDisplay] = useState(value)
  const reduceMotion = useReducedMotion()
  const fromRef = useRef(value)

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value)
      fromRef.current = value
      return
    }
    const from = fromRef.current
    const to = value
    const start = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs, reduceMotion])

  return (
    <span className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  )
}
