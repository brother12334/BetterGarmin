function escapeCsvCell(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  const lines = [columns.map(escapeCsvCell).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, columns: string[], rows: unknown[][]) {
  const csv = toCsv(columns, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Converts an array of row objects (e.g. typed query results) into CSV, using the first row's keys as columns. */
export function downloadObjectsAsCsv<T extends object>(filename: string, objects: T[]) {
  if (objects.length === 0) {
    downloadCsv(filename, [], [])
    return
  }
  const columns = Object.keys(objects[0]) as (keyof T)[]
  const rows = objects.map((obj) => columns.map((c) => obj[c]))
  downloadCsv(filename, columns as string[], rows)
}
