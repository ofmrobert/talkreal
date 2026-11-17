import { and, eq, gte, sql } from 'drizzle-orm'
import { limitsFor } from '../billing/plans'
import { db } from '../db/client'
import { dailyUsage } from '../db/schema'

/** Seconds of AI voice the student may still use right now (the smaller of today's and this month's allowance). */
export async function remainingVoiceSeconds(userId: string, plan: string, today: string): Promise<number> {
  const limits = limitsFor(plan)
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
