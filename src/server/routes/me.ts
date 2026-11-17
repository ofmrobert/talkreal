import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { db } from '../db/client'
import { users } from '../db/schema'
import { getPii } from '../pii'

export const meRoutes = new Hono<AuthEnv>()

/** The logged-in student's profile. */
meRoutes.get('/', requireUser, async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const pii = await getPii(userId)

  return c.json({
    id: user.id,
    email: pii.email,
    displayName: pii.displayName,
    level: user.level,
    plan: user.plan,
    xp: user.xp,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
  })
})
