/** Deterministic PRNG (mulberry32) so regenerating the demo dataset gives stable output. */
export function createRng(seed: number) {
  let a = seed >>> 0

  function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    range(min: number, max: number): number {
      return min + next() * (max - min)
    },
    int(min: number, max: number): number {
      return Math.floor(min + next() * (max - min + 1))
    },
    gaussian(mean: number, stdDev: number): number {
      const u1 = Math.max(next(), 1e-9)
      const u2 = next()
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      return mean + z * stdDev
    },
    chance(probability: number): boolean {
      return next() < probability
    },
    choice<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)]
    },
    weightedChoice<T>(items: readonly { value: T; weight: number }[]): T {
      const total = items.reduce((sum, i) => sum + i.weight, 0)
      let roll = next() * total
      for (const item of items) {
        roll -= item.weight
        if (roll <= 0) return item.value
      }
      return items[items.length - 1].value
    },
  }
}

export type Rng = ReturnType<typeof createRng>
