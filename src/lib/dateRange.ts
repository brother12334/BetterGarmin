export function enumerateDays(startDay: string, endDay: string): string[] {
  const days: string[] = []
  const cur = new Date(`${startDay}T00:00:00`)
  const end = new Date(`${endDay}T00:00:00`)
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}
