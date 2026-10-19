import { useEffect, useState } from 'react'
import { bandIndexEvents, lastBandSync } from '../../lib/band/bandIndex'

export function useLastBandSync(): number | null {
  const [t, setT] = useState(lastBandSync)
  useEffect(() => {
    const f = () => setT(lastBandSync())
    bandIndexEvents.addEventListener('change', f)
    return () => bandIndexEvents.removeEventListener('change', f)
  }, [])
  return t
}
