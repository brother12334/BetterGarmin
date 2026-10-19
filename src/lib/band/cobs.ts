/**
 * Consistent Overhead Byte Stuffing. GFDI frames are COBS-encoded and wrapped in zero delimiters
 * (a leading and a trailing 0x00), so the receiver can split the byte stream on zeros.
 */
export function cobsEncode(data: Uint8Array): Uint8Array {
  const out: number[] = [0]
  let codeIdx = out.length
  out.push(0)
  let code = 1
  for (const b of data) {
    if (b === 0) {
      out[codeIdx] = code
      codeIdx = out.length
      out.push(0)
      code = 1
    } else {
      out.push(b)
      code++
      if (code === 0xff) {
        out[codeIdx] = code
        codeIdx = out.length
        out.push(0)
        code = 1
      }
    }
  }
  out[codeIdx] = code
  out.push(0)
  return Uint8Array.from(out)
}

/** Decodes one COBS block (without its zero delimiters). Returns null if the block is malformed. */
export function cobsDecode(block: Uint8Array): Uint8Array | null {
  const out: number[] = []
  let i = 0
  while (i < block.length) {
    const code = block[i++]
    if (code === 0) return null
    for (let k = 1; k < code; k++) {
      if (i >= block.length) return null
      out.push(block[i++])
    }
    if (code < 0xff && i < block.length) out.push(0)
  }
  return Uint8Array.from(out)
}

/** Accumulates a zero-delimited COBS byte stream and yields complete decoded frames. */
export class CobsStream {
  private buf: number[] = []

  push(chunk: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = []
    for (const b of chunk) {
      if (b === 0) {
        if (this.buf.length > 0) {
          const decoded = cobsDecode(Uint8Array.from(this.buf))
          if (decoded) frames.push(decoded)
        }
        this.buf = []
      } else {
        this.buf.push(b)
      }
    }
    return frames
  }

  reset() {
    this.buf = []
  }
}
