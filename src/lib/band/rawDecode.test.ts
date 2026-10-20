import { describe, expect, it } from 'vitest'
import { protoTree } from './rawDecode'
import { lfield, vfield } from './proto'

describe('raw decode', () => {
  it('expands nested protobuf, labels timestamps and text', () => {
    const fitTime = 1_130_000_000 // 2025 in FIT seconds
    const bytes = Uint8Array.from([...vfield(1, 8423), ...lfield(2, [...vfield(1, fitTime), ...lfield(3, new TextEncoder().encode('steps'))])])
    const out = protoTree(bytes).join('\n')
    expect(out).toContain('1: 8423')
    expect(out).toMatch(/2: \{\n  1: 1130000000 \(FIT time\? 2025-/)
    expect(out).toContain('3: "steps"')
  })
})
