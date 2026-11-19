import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { DAILY_XP_GOAL } from '../billing/plans'
import { db } from '../db/client'
import { users } from '../db/schema'
import { awardAchievements } from '../progress/achievements'
import { recordActivity, usageToday } from '../progress/activity'
import { applyResults, buildSession, countDue } from '../progress/review'
import { localDay, safeTimezone } from '../progress/streak'

/** XP for a review session: a little for showing up, plus one for every item remembered. */
const XP_BASE = 3
const XP_MAX = 15

export const reviewRoutes = new Hono<AuthEnv>()
reviewRoutes.use('/review/*', requireUser)
reviewRoutes.use('/review', requireUser)

/** Today's review session. Review is free and does not count towards the daily lesson limit. */
reviewRoutes.get('/review', async (c) => {
  const [user] = await db.select().from(users).where(eq(users.id, c.get('userId'))).limit(1)
  if (!user) return c.json({ error: 'not_found' }, 404)
  const today = localDay(safeTimezone(c.req.query('tz') ?? user.timezone))
  const items = await buildSession(user.id, today)
  return c.json({ items, due: await countDue(user.id, today) })
})

/** Called when the student finishes a review session. */
reviewRoutes.post('/review/complete', async (c) => {
  const [user] = await db.select().from(users).where(eq(users.id, c.get('userId'))).limit(1)
  if (!user) return c.json({ error: 'not_found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const results: { id: string; correct: boolean }[] = (Array.isArray(body.results) ? body.results : [])
    .filter((r: unknown) => typeof (r as { id?: unknown })?.id === 'string')
    .slice(0, 50)
    .map((r: { id: string; correct?: unknown }) => ({ id: r.id, correct: r.correct === true }))
  const timezone = safeTimezone(body.tz ?? user.timezone)
  const today = localDay(timezone)
  const usage = await usageToday(user.id, today)

  const outcome = await db.transaction(async (tx) => {
    const applied = await applyResults(tx, user.id, results, today)
    if (applied.reviewed === 0) return null
    const xpEarned = Math.min(XP_MAX, XP_BASE + applied.correct)
    const streak = await recordActivity(tx, user, { today, timezone, xp: xpEarned, lessons: 0 })
    return { ...applied, xpEarned, streak }
  })
  if (!outcome) return c.json({ error: 'nothing_due' }, 409)

  const newAchievements = await awardAchievements(user.id).catch((err) => {
    console.error('Could not award achievements:', err)
    return []
  })

  return c.json({
    newAchievements,
    freezeUsed: outcome.streak.freezeUsed,
    freezeEarned: outcome.streak.freezeEarned,
    freezes: outcome.streak.freezes,
    xpEarned: outcome.xpEarned,
    accuracy: Math.round((outcome.correct / outcome.reviewed) * 100),
    totalXp: user.xp + outcome.xpEarned,
    streak: outcome.streak.streak,
    streakExtended: outcome.streak.extended,
    firstTime: false,
    todayXp: usage.xp + outcome.xpEarned,
    xpGoal: DAILY_XP_GOAL,
    /** Items still waiting today, so the app can offer another round. */
    due: await countDue(user.id, today),
  })
})
