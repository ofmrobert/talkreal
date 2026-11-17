import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { isLevel } from '../../shared/levels'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { DAILY_XP_GOAL, limitsFor } from '../billing/plans'
import { lessonById, lessonsFor } from '../content/lessons'
import { db } from '../db/client'
import { dailyUsage, lessonProgress, users } from '../db/schema'
import { currentStreak, localDay, safeTimezone, streakAfterActivity } from '../progress/streak'

const XP_BASE = 10
const XP_ACCURACY_BONUS = 10
const XP_REPLAY = 5

async function loadUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return user
}

async function usageToday(userId: string, day: string) {
  const [row] = await db
    .select()
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.day, day)))
    .limit(1)
  return { lessonsDone: row?.lessonsDone ?? 0, xp: row?.xp ?? 0 }
}

/** A lesson is open if it is the first one or the one before it has been completed. */
function isUnlocked(lessonId: string, courseIds: string[], done: Set<string>): boolean {
  const index = courseIds.indexOf(lessonId)
  return index === 0 || (index > 0 && done.has(courseIds[index - 1]))
}

export const courseRoutes = new Hono<AuthEnv>()
courseRoutes.use('*', requireUser)

/** The course map for the student's level, plus today's numbers. */
courseRoutes.get('/course', async (c) => {
  const user = await loadUser(c.get('userId'))
  if (!user || !isLevel(user.level)) return c.json({ error: 'no_level' }, 409)

  const timezone = safeTimezone(c.req.query('tz') ?? user.timezone)
  const today = localDay(timezone)
  const course = lessonsFor(user.level)
  const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.userId, user.id))
  const best = new Map(progress.map((p) => [p.lessonId, p.bestAccuracy]))
  const done = new Set(best.keys())
  const ids = course.map((l) => l.id)
  const usage = await usageToday(user.id, today)
  const limit = limitsFor(user.plan).lessonsPerDay

  return c.json({
    level: user.level,
    xp: user.xp,
    streak: currentStreak(user.currentStreak, user.lastActiveDate, today),
    longestStreak: user.longestStreak,
    today: {
      xp: usage.xp,
      xpGoal: DAILY_XP_GOAL,
      lessonsDone: usage.lessonsDone,
      lessonsLimit: Number.isFinite(limit) ? limit : null,
    },
    lessons: course.map((l) => ({
      id: l.id,
      order: l.order,
      title: l.title,
      goal: l.goal,
      exercises: l.exercises.length,
      status: done.has(l.id) ? 'done' : isUnlocked(l.id, ids, done) ? 'open' : 'locked',
      bestAccuracy: best.get(l.id) ?? null,
    })),
  })
})

/** One full lesson. Refused if it is still locked or today's free lessons are used up. */
courseRoutes.get('/lessons/:id', async (c) => {
  const user = await loadUser(c.get('userId'))
  const lesson = lessonById(c.req.param('id'))
  if (!user || !lesson) return c.json({ error: 'not_found' }, 404)

  const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.userId, user.id))
  const done = new Set(progress.map((p) => p.lessonId))
  const ids = lessonsFor(lesson.level).map((l) => l.id)
  if (!done.has(lesson.id) && !isUnlocked(lesson.id, ids, done)) return c.json({ error: 'locked' }, 403)

  const today = localDay(safeTimezone(c.req.query('tz') ?? user.timezone))
  const usage = await usageToday(user.id, today)
  if (usage.lessonsDone >= limitsFor(user.plan).lessonsPerDay) return c.json({ error: 'daily_limit' }, 403)

  return c.json({ lesson })
})

/** Called when the student finishes a lesson. Awards XP and updates the streak. */
courseRoutes.post('/lessons/:id/complete', async (c) => {
  const user = await loadUser(c.get('userId'))
  const lesson = lessonById(c.req.param('id'))
  if (!user || !lesson) return c.json({ error: 'not_found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const total = lesson.exercises.length
  const firstTry = Number.isInteger(body.correctFirstTry) ? Math.min(Math.max(body.correctFirstTry, 0), total) : 0
  const accuracy = Math.round((firstTry / total) * 100)
  const timezone = safeTimezone(body.tz ?? user.timezone)
  const today = localDay(timezone)

  const usage = await usageToday(user.id, today)
  if (usage.lessonsDone >= limitsFor(user.plan).lessonsPerDay) return c.json({ error: 'daily_limit' }, 403)

  const [existing] = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, lesson.id)))
    .limit(1)

  const xpEarned = existing ? XP_REPLAY : XP_BASE + Math.round((XP_ACCURACY_BONUS * accuracy) / 100)
  const streak = streakAfterActivity(user.currentStreak, user.lastActiveDate, today)

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(lessonProgress)
        .set({
          completions: existing.completions + 1,
          bestAccuracy: Math.max(existing.bestAccuracy, accuracy),
          lastCompletedAt: new Date(),
        })
        .where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, lesson.id)))
    } else {
      await tx.insert(lessonProgress).values({ userId: user.id, lessonId: lesson.id, bestAccuracy: accuracy })
    }

    await tx
      .insert(dailyUsage)
      .values({ userId: user.id, day: today, lessonsDone: 1, xp: xpEarned })
      .onConflictDoUpdate({
        target: [dailyUsage.userId, dailyUsage.day],
        set: { lessonsDone: sql`${dailyUsage.lessonsDone} + 1`, xp: sql`${dailyUsage.xp} + ${xpEarned}` },
      })

    await tx
      .update(users)
      .set({
        xp: user.xp + xpEarned,
        currentStreak: streak.streak,
        longestStreak: Math.max(user.longestStreak, streak.streak),
        lastActiveDate: today,
        timezone,
      })
      .where(eq(users.id, user.id))
  })

  return c.json({
    xpEarned,
    accuracy,
    totalXp: user.xp + xpEarned,
    streak: streak.streak,
    streakExtended: streak.extended,
    firstTime: !existing,
    todayXp: usage.xp + xpEarned,
    xpGoal: DAILY_XP_GOAL,
  })
})
