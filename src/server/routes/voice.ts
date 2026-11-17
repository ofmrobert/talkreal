import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { limitsFor } from '../billing/plans'
import { db } from '../db/client'
import { users } from '../db/schema'
import { localDay, safeTimezone } from '../progress/streak'
import { voiceProvider } from '../voice/socket'
import { remainingVoiceSeconds } from '../voice/usage'

export const voiceRoutes = new Hono<AuthEnv>()

/** Whether voice calls are switched on, and how much time the student has left. */
voiceRoutes.get('/status', requireUser, async (c) => {
  const [user] = await db.select().from(users).where(eq(users.id, c.get('userId'))).limit(1)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const today = localDay(safeTimezone(c.req.query('tz') ?? user.timezone))
  return c.json({
    available: voiceProvider() !== null,
    remainingSeconds: await remainingVoiceSeconds(user.id, user.plan, today),
    dailySeconds: limitsFor(user.plan).voiceSecondsPerDay,
  })
})
