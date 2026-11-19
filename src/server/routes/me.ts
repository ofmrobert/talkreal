import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { renewSession, requireUser, type AuthEnv } from '../auth/sessions'
import { db } from '../db/client'
import { users } from '../db/schema'
import { getPii } from '../pii'
import { localDay, safeTimezone, streakNow } from '../progress/streak'

export const meRoutes = new Hono<AuthEnv>()

/** The logged-in student's profile. */
meRoutes.get('/', requireUser, async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const pii = await getPii(userId)
  // Opening the app keeps the student logged in. A failure here must not block the app.
  await renewSession(c).catch((err) => console.error('Could not renew the session:', err))

  return c.json({
    id: user.id,
    email: pii.email,
    displayName: pii.displayName,
    level: user.level,
    plan: user.plan,
    xp: user.xp,
    currentStreak: streakNow(user.currentStreak, user.lastActiveDate, localDay(safeTimezone(user.timezone)), user.streakFreezes).streak,
    freezes: user.streakFreezes,
    longestStreak: user.longestStreak,
  })
})
