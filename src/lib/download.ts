/**
 * Hands the viewer a file to save. iPhone browsers like Bluefy ignore <a download>, so the Share sheet is tried first
 * (Save to Files, AirDrop, Messages); a plain download is the fallback. Returns how the file was offered.
 */
export async function downloadBlob(filename: string, data: BlobPart, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([data], { type })
  try {
    const file = new File([blob], filename, { type })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
    // fall through to a plain download
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

/** Copies text to the clipboard, with a fallback for browsers without the async clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}
