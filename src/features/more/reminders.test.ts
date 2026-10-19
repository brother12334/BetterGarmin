import { describe, expect, it } from 'vitest'
import { DEFAULT_REMINDERS, inQuietHours, reminderDue } from './reminders'

const at = (s: string) => new Date(s)

describe('reminders', () => {
  it('quiet hours wrap past midnight', () => {
    expect(inQuietHours(at('2026-10-19T23:30:00'), DEFAULT_REMINDERS)).toBe(true)
    expect(inQuietHours(at('2026-10-19T06:59:00'), DEFAULT_REMINDERS)).toBe(true)
    expect(inQuietHours(at('2026-10-19T07:00:00'), DEFAULT_REMINDERS)).toBe(false)
  })
  it('fires once on a chosen day, not in quiet hours, not when disabled', () => {
    const s = { ...DEFAULT_REMINDERS, enabled: true } // 18:00 weekdays
    const mon = at('2026-10-19T18:05:00')
    expect(reminderDue(mon, s, null)).toBe(true)
    expect(reminderDue(mon, s, mon.toDateString())).toBe(false)
    expect(reminderDue(at('2026-10-18T18:05:00'), s, null)).toBe(false) // Sunday
    expect(reminderDue(at('2026-10-19T22:30:00'), { ...s, time: '22:15' }, null)).toBe(false) // quiet hours
    expect(reminderDue(mon, { ...s, enabled: false }, null)).toBe(false)
  })
})
