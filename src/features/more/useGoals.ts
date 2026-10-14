import { useEffect, useMemo, useState } from 'react'

export interface Goals {
  steps: number
  sleepMinutes: number
  activeDays: number
}

const STORAGE_KEY = 'bettergarmin:goals'
const DEFAULT_GOALS: Goals = { steps: 10000, sleepMinutes: 480, activeDays: 5 }

function loadStoredGoals(): Goals {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_GOALS, ...JSON.parse(stored) }
  } catch {
    // ignore (private browsing, blocked storage, or malformed JSON)
  }
  return DEFAULT_GOALS
}

export function useGoals() {
  const [goals, setGoalsState] = useState<Goals>(loadStoredGoals)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
    } catch {
      // per-viewer convenience only; fine to lose
    }
  }, [goals])

  const setGoal = useMemo(
    () => (key: keyof Goals, value: number) => setGoalsState((g) => ({ ...g, [key]: value })),
    [],
  )

  return { goals, setGoal }
}
