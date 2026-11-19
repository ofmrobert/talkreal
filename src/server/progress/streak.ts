/** Calendar-day helpers. A "day" is always the student's own local day, written as YYYY-MM-DD. */

/** A student can hold at most this many streak freezes. */
export const MAX_FREEZES = 2
/** A new freeze is earned every time the streak reaches a multiple of this many days. */
export const FREEZE_EVERY_DAYS = 7

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

/** The hour (0–23) on the student's own clock. */
export function localHour(timezone: string, at: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(at))
}

export function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** True when exactly one day (yesterday) was missed, which is what a freeze can cover. */
function missedOnlyYesterday(lastActiveDay: string | null, today: string): boolean {
  return lastActiveDay === dayBefore(dayBefore(today))
}

/**
 * The streak to show right now. It drops to 0 once a full day has been missed,
 * unless a freeze is in stock: then it stays alive for one more day ("frozen").
 */
export function streakNow(streak: number, lastActiveDay: string | null, today: string, freezes: number) {
  if (!lastActiveDay || streak === 0) return { streak: 0, frozen: false }
  if (lastActiveDay === today || lastActiveDay === dayBefore(today)) return { streak, frozen: false }
  if (freezes > 0 && missedOnlyYesterday(lastActiveDay, today)) return { streak, frozen: true }
  return { streak: 0, frozen: false }
}

/** The streak after the student completes something today, and what happened to their freezes. */
export function streakAfterActivity(streak: number, lastActiveDay: string | null, today: string, freezes: number) {
  let next = 1
  let extended = true
  let freezeUsed = false

  if (lastActiveDay === today) {
    next = Math.max(streak, 1)
    extended = false
  } else if (lastActiveDay === dayBefore(today)) {
    next = streak + 1
  } else if (streak > 0 && freezes > 0 && missedOnlyYesterday(lastActiveDay, today)) {
    next = streak + 1
    freezeUsed = true
  }

  let left = freezes - (freezeUsed ? 1 : 0)
  const freezeEarned = extended && next % FREEZE_EVERY_DAYS === 0 && left < MAX_FREEZES
  if (freezeEarned) left += 1

  return { streak: next, extended, freezeUsed, freezeEarned, freezes: left }
}

/** The day `days` days after the given one. */
export function dayAfter(day: string, days = 1): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
