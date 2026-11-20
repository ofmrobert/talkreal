import { and, eq, gte, sql } from 'drizzle-orm'
import { ACHIEVEMENTS, type AchievementKey } from '../../shared/achievements'
import { isLevel } from '../../shared/levels'
import { lessonById, lessonsFor } from '../content/lessons'
import { db } from '../db/client'
import { lessonProgress, userAchievements, users, voiceSessions } from '../db/schema'

/** A voice call counts for the badge once it lasted this long. */
const FIRST_CALL_SECONDS = 30

/**
 * Looks at everything the student has done and hands out any badge they have earned
 * but do not have yet. Returns only the newly earned ones, so the app can celebrate them.
 */
export async function awardAchievements(userId: string): Promise<AchievementKey[]> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return []

  const have = new Set(
    (await db.select({ key: userAchievements.key }).from(userAchievements).where(eq(userAchievements.userId, userId))).map(
      (row) => row.key,
    ),
  )
  if (have.size >= ACHIEVEMENTS.length) return []

  // Unit tests and exams are kept in the same table; the badges count real lessons only.
  const progress = (
    await db
      .select({ lessonId: lessonProgress.lessonId, bestAccuracy: lessonProgress.bestAccuracy })
      .from(lessonProgress)
      .where(eq(lessonProgress.userId, userId))
  ).filter((p) => lessonById(p.lessonId) !== undefined)
  const done = new Set(progress.map((p) => p.lessonId))
  const [calls] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceSessions)
    .where(and(eq(voiceSessions.userId, userId), gte(voiceSessions.seconds, FIRST_CALL_SECONDS)))

  const levelLessons = isLevel(user.level) ? lessonsFor(user.level) : []
  // The longest streak never goes down, so a badge is not lost by checking late.
  const streak = Math.max(user.currentStreak, user.longestStreak)

  const earned: Record<AchievementKey, boolean> = {
    first_lesson: done.size >= 1,
    perfect: progress.some((p) => p.bestAccuracy === 100),
    streak_3: streak >= 3,
    streak_7: streak >= 7,
    streak_30: streak >= 30,
    lessons_10: done.size >= 10,
    lessons_25: done.size >= 25,
    lessons_50: done.size >= 50,
    xp_100: user.xp >= 100,
    xp_500: user.xp >= 500,
    xp_1000: user.xp >= 1000,
    level_done: levelLessons.length > 0 && levelLessons.every((l) => done.has(l.id)),
    first_call: (calls?.count ?? 0) > 0,
  }

  const fresh = ACHIEVEMENTS.map((a) => a.key).filter((key) => earned[key] && !have.has(key))
  if (fresh.length === 0) return []

  const inserted = await db
    .insert(userAchievements)
    .values(fresh.map((key) => ({ userId, key })))
    .onConflictDoNothing()
    .returning({ key: userAchievements.key })
  return inserted.map((row) => row.key as AchievementKey)
}

export async function listAchievements(userId: string) {
  return db
    .select({ key: userAchievements.key, earnedAt: userAchievements.earnedAt })
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId))
}
