import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UnitSystem } from '../lib/units'

interface UnitsContextValue {
  units: UnitSystem
  setUnits: (units: UnitSystem) => void
}

const UnitsContext = createContext<UnitsContextValue | null>(null)
const STORAGE_KEY = 'bettergarmin:units'

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<UnitSystem>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'metric' || stored === 'imperial') return stored
    } catch {
      // ignore (private browsing, blocked storage, etc.)
    }
    return 'metric'
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, units)
    } catch {
      // per-viewer convenience only; fine to lose
    }
  }, [units])

  const value = useMemo(() => ({ units, setUnits: setUnitsState }), [units])

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>
}

export function useUnits() {
  const ctx = useContext(UnitsContext)
  if (!ctx) throw new Error('useUnits must be used within UnitsProvider')
  return ctx
}
