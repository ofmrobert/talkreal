import { and, eq, gte } from 'drizzle-orm'
import { Hono } from 'hono'
import { isLevel } from '../../shared/levels'
import { GOOD_LESSON_ACCURACY } from '../../shared/play'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { DAILY_XP_GOAL, limitsFor, planOf } from '../billing/plans'
import { lessonById } from '../content/lessons'
import { courseState, examId, LEVEL_EXAM, nextLevel, UNIT_TEST, unitsFor } from '../content/units'
import { db } from '../db/client'
import { dailyUsage, lessonProgress, users } from '../db/schema'
import { awardAchievements, listAchievements } from '../progress/achievements'
import { recordActivity, usageToday } from '../progress/activity'
import { countDue, scheduleAfterLesson } from '../progress/review'
import { dayBefore, localDay, safeTimezone, streakNow } from '../progress/streak'

const XP_BASE = 10
const XP_ACCURACY_BONUS = 10
const XP_REPLAY = 5

async function loadUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return user
}

export const courseRoutes = new Hono<AuthEnv>()
courseRoutes.use('*', requireUser)

/** The course map for the student's level, plus today's numbers. */
courseRoutes.get('/course', async (c) => {
  const user = await loadUser(c.get('userId'))
  if (!user || !isLevel(user.level)) return c.json({ error: 'no_level' }, 409)

  const timezone = safeTimezone(c.req.query('tz') ?? user.timezone)
  const today = localDay(timezone)
  const units = unitsFor(user.level)
  const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.userId, user.id))
  const best = new Map(progress.map((p) => [p.lessonId, p.bestAccuracy]))
  const done = new Set(best.keys())
  const status = courseState(user.level, done)
  const usage = await usageToday(user.id, today)
  const lessonNode = (l: (typeof units)[number]['lessons'][number]) => ({
    id: l.id,
    order: l.order,
    title: l.title,
    goal: l.goal,
    exercises: l.exercises.length,
    status: status.get(l.id) ?? 'locked',
    bestAccuracy: best.get(l.id) ?? null,
  })
  const exam = examId(user.level)
  const limit = limitsFor(planOf(user)).lessonsPerDay

  // The last seven days, oldest first, for the week strip on the home screen.
  const days: string[] = [today]
  while (days.length < 7) days.unshift(dayBefore(days[0]))
  const recent = await db
    .select({ day: dailyUsage.day, xp: dailyUsage.xp })
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, user.id), gte(dailyUsage.day, days[0])))
  const xpByDay = new Map(recent.map((r) => [r.day, r.xp]))
  const streak = streakNow(user.currentStreak, user.lastActiveDate, today, user.streakFreezes)

  return c.json({
    week: days.map((day) => ({ day, xp: xpByDay.get(day) ?? 0 })),
    level: user.level,
    xp: user.xp,
    streak: streak.streak,
    /** True when yesterday was missed and a freeze is holding the streak: a lesson today saves it. */
    streakFrozen: streak.frozen,
    freezes: user.streakFreezes,
    longestStreak: user.longestStreak,
    /** Words and missed exercises waiting to be repeated today. */
    reviewDue: await countDue(user.id, today),
    today: {
      xp: usage.xp,
      xpGoal: DAILY_XP_GOAL,
      lessonsDone: usage.lessonsDone,
      lessonsLimit: Number.isFinite(limit) ? limit : null,
    },
    /** The course as a path: units of lessons, each closed by a test, and the level exam at the end. */
    units: units.map((unit) => ({
      number: unit.number,
      title: unit.title,
      lessons: unit.lessons.map(lessonNode),
      test: { id: unit.testId, status: status.get(unit.testId) ?? 'locked', bestAccuracy: best.get(unit.testId) ?? null, questions: UNIT_TEST.size, passMark: UNIT_TEST.passMark },
    })),
    exam: { id: exam, status: status.get(exam) ?? 'locked', bestAccuracy: best.get(exam) ?? null, nextLevel: nextLevel(user.level), questions: LEVEL_EXAM.size, passMark: LEVEL_EXAM.passMark },
    /** The same lessons as one flat list, for app versions from before the path. */
    lessons: units.flatMap((unit) => unit.lessons.map(lessonNode)),
  })
})

/** The student's badges. Checking here also catches badges earned outside lessons (voice calls). */
courseRoutes.get('/achievements', async (c) => {
  const userId = c.get('userId')
  const fresh = await awardAchievements(userId)
  return c.json({ earned: await listAchievements(userId), fresh })
})

/** One full lesson. Refused if it is still locked or today's free lessons are used up. */
courseRoutes.get('/lessons/:id', async (c) => {
  const user = await loadUser(c.get('userId'))
  const lesson = lessonById(c.req.param('id'))
  if (!user || !lesson) return c.json({ error: 'not_found' }, 404)

  const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.userId, user.id))
  const done = new Set(progress.map((p) => p.lessonId))
  if (courseState(lesson.level, done).get(lesson.id) === 'locked') return c.json({ error: 'locked' }, 403)

  const today = localDay(safeTimezone(c.req.query('tz') ?? user.timezone))
  const usage = await usageToday(user.id, today)
  if (usage.lessonsDone >= limitsFor(planOf(user)).lessonsPerDay) return c.json({ error: 'daily_limit' }, 403)

  return c.json({ lesson })
})

/** Called when the student finishes a lesson. Awards XP and updates the streak. */
courseRoutes.post('/lessons/:id/complete', async (c) => {
  const user = await loadUser(c.get('userId'))
  const lesson = lessonById(c.req.param('id'))
  if (!user || !lesson) return c.json({ error: 'not_found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const total = lesson.exercises.length
  // Positions of the exercises that were not right the first time. Older app versions send only the count.
  const missed: number[] | null = Array.isArray(body.missed)
    ? [...new Set<number>(body.missed.filter((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < total))]
    : null
  const firstTry = missed
    ? total - missed.length
    : Number.isInteger(body.correctFirstTry)
      ? Math.min(Math.max(body.correctFirstTry, 0), total)
      : 0
  const accuracy = Math.round((firstTry / total) * 100)
  const timezone = safeTimezone(body.tz ?? user.timezone)
  const today = localDay(timezone)

  const usage = await usageToday(user.id, today)
  if (usage.lessonsDone >= limitsFor(planOf(user)).lessonsPerDay) return c.json({ error: 'daily_limit' }, 403)

  const [existing] = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, lesson.id)))
    .limit(1)

  const xpEarned = existing ? XP_REPLAY : XP_BASE + Math.round((XP_ACCURACY_BONUS * accuracy) / 100)

  const streak = await db.transaction(async (tx) => {
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

    await scheduleAfterLesson(tx, user.id, lesson, missed ?? [], today)
    return recordActivity(tx, user, { today, timezone, xp: xpEarned, lessons: 1, goodLessons: accuracy >= GOOD_LESSON_ACCURACY ? 1 : 0 })
  })

  const newAchievements = await awardAchievements(user.id).catch((err) => {
    console.error('Could not award achievements:', err)
    return []
  })

  return c.json({
    newAchievements,
    freezeUsed: streak.freezeUsed,
    freezeEarned: streak.freezeEarned,
    freezes: streak.freezes,
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
