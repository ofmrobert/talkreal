import { and, eq, sql } from 'drizzle-orm'
import { db, type Db } from '../db/client'
import { dailyUsage, users } from '../db/schema'
import { streakAfterActivity } from './streak'

/** The database handle inside a transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

type User = typeof users.$inferSelect

export async function usageToday(userId: string, day: string) {
  const [row] = await db
    .select()
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.day, day)))
    .limit(1)
  return { lessonsDone: row?.lessonsDone ?? 0, xp: row?.xp ?? 0 }
}

/**
 * Writes down that the student finished something today (a lesson or a review session):
 * adds the XP to the day and to the total, and moves the streak on.
 */
export async function recordActivity(
  tx: Tx,
  user: User,
  done: { today: string; timezone: string; xp: number; lessons: number },
) {
  const streak = streakAfterActivity(user.currentStreak, user.lastActiveDate, done.today, user.streakFreezes)

  await tx
    .insert(dailyUsage)
    .values({ userId: user.id, day: done.today, lessonsDone: done.lessons, xp: done.xp })
    .onConflictDoUpdate({
      target: [dailyUsage.userId, dailyUsage.day],
      set: { lessonsDone: sql`${dailyUsage.lessonsDone} + ${done.lessons}`, xp: sql`${dailyUsage.xp} + ${done.xp}` },
    })

  await tx
    .update(users)
    .set({
      xp: user.xp + done.xp,
      currentStreak: streak.streak,
      longestStreak: Math.max(user.longestStreak, streak.streak),
      lastActiveDate: done.today,
      streakFreezes: streak.freezes,
      timezone: done.timezone,
    })
    .where(eq(users.id, user.id))

  return streak
}
