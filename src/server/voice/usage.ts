import { and, eq, gte, sql } from 'drizzle-orm'
import { limitsFor } from '../billing/plans'
import { db } from '../db/client'
import { dailyUsage } from '../db/schema'

/**
 * Seconds of AI voice the student may still use right now: the smaller of today's and this month's allowance,
 * or, on a plan with a one-time test, what is left of it (every second ever used counts, on any plan).
 */
export async function remainingVoiceSeconds(userId: string, plan: string, today: string): Promise<number> {
  const limits = limitsFor(plan)
  if (limits.voiceSecondsEver !== undefined) {
    const [used] = await db.select({ seconds: sql<number>`coalesce(sum(${dailyUsage.voiceSeconds}), 0)::int` }).from(dailyUsage).where(eq(dailyUsage.userId, userId))
    return Math.max(0, limits.voiceSecondsEver - (used?.seconds ?? 0))
  }
  const monthStart = `${today.slice(0, 7)}-01`
  const rows = await db
    .select({ day: dailyUsage.day, seconds: dailyUsage.voiceSeconds })
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, userId), gte(dailyUsage.day, monthStart)))

  const usedToday = rows.find((r) => r.day === today)?.seconds ?? 0
  const usedThisMonth = rows.reduce((sum, r) => sum + r.seconds, 0)
  return Math.max(0, Math.min(limits.voiceSecondsPerDay - usedToday, limits.voiceSecondsPerMonth - usedThisMonth))
}

export async function addVoiceSeconds(userId: string, day: string, seconds: number): Promise<void> {
  if (seconds <= 0) return
  await db
    .insert(dailyUsage)
    .values({ userId, day, voiceSeconds: seconds })
    .onConflictDoUpdate({
      target: [dailyUsage.userId, dailyUsage.day],
      set: { voiceSeconds: sql`${dailyUsage.voiceSeconds} + ${seconds}` },
    })
}
