/** Calendar-day helpers. A "day" is always the student's own local day, written as YYYY-MM-DD. */

export function safeTimezone(tz: unknown): string {
  if (typeof tz !== 'string') return 'Europe/Moscow'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return tz
  } catch {
    return 'Europe/Moscow'
  }
}

export function localDay(timezone: string, at: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at)
}

export function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** The streak to show right now: it drops to 0 once a full day has been missed. */
export function currentStreak(streak: number, lastActiveDay: string | null, today: string): number {
  if (!lastActiveDay) return 0
  return lastActiveDay === today || lastActiveDay === dayBefore(today) ? streak : 0
}

/** The streak after the student completes something today. */
export function streakAfterActivity(streak: number, lastActiveDay: string | null, today: string) {
  if (lastActiveDay === today) return { streak: Math.max(streak, 1), extended: false }
  if (lastActiveDay === dayBefore(today)) return { streak: streak + 1, extended: true }
  return { streak: 1, extended: true }
}
