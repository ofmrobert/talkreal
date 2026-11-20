import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Exercise, Lesson } from '../../shared/lesson'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { DAILY_XP_GOAL } from '../billing/plans'
import { lessonsFor } from '../content/lessons'
import { courseState, findTest, LEVEL_EXAM, nextLevel, UNIT_TEST } from '../content/units'
import { db } from '../db/client'
import { lessonProgress, users } from '../db/schema'
import { awardAchievements } from '../progress/achievements'
import { recordActivity, usageToday } from '../progress/activity'
import { localDay, safeTimezone } from '../progress/streak'

/** XP for passing a test again, and for an attempt that did not pass. */
const XP_REPEAT = 5
const XP_ATTEMPT = 2

function shuffled<T>(items: T[]): T[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

/**
 * Picks the questions: the same number from every lesson, so the test covers everything.
 * Speaking is left out (not every phone can do it) and so is matching (too easy for a test).
 */
function pickExercises(lessons: Lesson[], size: number): Exercise[] {
  const piles = shuffled(lessons).map((lesson) => shuffled(lesson.exercises.filter((e) => e.type !== 'speak' && e.type !== 'match')))
  const picked: Exercise[] = []
  while (picked.length < size && piles.some((pile) => pile.length > 0)) {
    for (const pile of piles) {
      const exercise = pile.pop()
      if (exercise && picked.length < size) picked.push(exercise)
    }
  }
  return shuffled(picked)
}

async function load(userId: string, testId: string) {
  const test = findTest(testId)
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!test || !user) return null
  const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.userId, user.id))
  const done = new Set(progress.map((p) => p.lessonId))
  const rules = test.kind === 'unit' ? UNIT_TEST : LEVEL_EXAM
  const lessons = test.kind === 'unit' ? test.unit.lessons : lessonsFor(test.level)
  return { test, user, rules, lessons, status: courseState(test.level, done).get(testId) ?? 'locked', previous: progress.find((p) => p.lessonId === testId) }
}

export const testRoutes = new Hono<AuthEnv>()
testRoutes.use('/tests/*', requireUser)

/** The questions of a unit test or a level exam. Tests are free: they do not use up the daily lessons. */
testRoutes.get('/tests/:id', async (c) => {
  const found = await load(c.get('userId'), c.req.param('id'))
  if (!found) return c.json({ error: 'not_found' }, 404)
  if (found.status === 'locked') return c.json({ error: 'locked' }, 403)

  const { test, rules, lessons } = found
  return c.json({
    id: c.req.param('id'),
    kind: test.kind,
    level: test.level,
    unit: test.kind === 'unit' ? { number: test.unit.number, title: test.unit.title } : null,
    passMark: rules.passMark,
    exercises: pickExercises(lessons, rules.size),
  })
})

/** Called when the student finishes a test. A passed exam moves them to the next level. */
testRoutes.post('/tests/:id/complete', async (c) => {
  const id = c.req.param('id')
  const found = await load(c.get('userId'), id)
  if (!found) return c.json({ error: 'not_found' }, 404)
  if (found.status === 'locked') return c.json({ error: 'locked' }, 403)
  const { test, user, rules, previous } = found

  const body = await c.req.json().catch(() => ({}))
  const total = Number.isInteger(body.total) ? Math.min(Math.max(body.total, 1), rules.size) : rules.size
  const missed = Number.isInteger(body.missed) ? Math.min(Math.max(body.missed, 0), total) : total
  const accuracy = Math.round(((total - missed) / total) * 100)
  const passed = accuracy >= rules.passMark
  const timezone = safeTimezone(body.tz ?? user.timezone)
  const today = localDay(timezone)
  const usage = await usageToday(user.id, today)

  const xpEarned = !passed ? XP_ATTEMPT : previous ? XP_REPEAT : rules.xp
  // Passing the exam of the level the student is on moves them up, once.
  const newLevel = passed && !previous && test.kind === 'exam' && user.level === test.level ? nextLevel(test.level) : null

  const streak = await db.transaction(async (tx) => {
    if (passed && previous) {
      await tx
        .update(lessonProgress)
        .set({
          completions: previous.completions + 1,
          bestAccuracy: Math.max(previous.bestAccuracy, accuracy),
          lastCompletedAt: new Date(),
        })
        .where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, id)))
    } else if (passed) {
      await tx.insert(lessonProgress).values({ userId: user.id, lessonId: id, bestAccuracy: accuracy })
    }
    const after = await recordActivity(tx, user, { today, timezone, xp: xpEarned, lessons: 0 })
    if (newLevel) await tx.update(users).set({ level: newLevel }).where(eq(users.id, user.id))
    return after
  })

  const newAchievements = await awardAchievements(user.id).catch((err) => {
    console.error('Could not award achievements:', err)
    return []
  })

  return c.json({
    passed,
    passMark: rules.passMark,
    newLevel,
    newAchievements,
    freezeUsed: streak.freezeUsed,
    freezeEarned: streak.freezeEarned,
    freezes: streak.freezes,
    xpEarned,
    accuracy,
    totalXp: user.xp + xpEarned,
    streak: streak.streak,
    streakExtended: streak.extended,
    firstTime: passed && !previous,
    todayXp: usage.xp + xpEarned,
    xpGoal: DAILY_XP_GOAL,
  })
})
