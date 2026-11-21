import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { renewSession, requireUser, type AuthEnv } from '../auth/sessions'
import { planOf } from '../billing/plans'
import { db } from '../db/client'
import { env } from '../env'
import { users } from '../db/schema'
import { getPii, getProfile } from '../pii'
import { localDay, safeTimezone, streakNow } from '../progress/streak'

export const meRoutes = new Hono<AuthEnv>()

/** The logged-in student's profile. */
meRoutes.get('/', requireUser, async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const pii = await getPii(userId)
  const profile = await getProfile(userId)
  const isAdmin = pii.email !== null && env.adminEmails.includes(pii.email.toLowerCase())
  // The owner has everything a verified teacher has (polls, posts open to everyone), without asking.
  if (isAdmin && !user.teacherAt) await db.update(users).set({ teacherAt: new Date() }).where(eq(users.id, userId))
  // Opening the app keeps the student logged in. A failure here must not block the app.
  await renewSession(c).catch((err) => console.error('Could not renew the session:', err))

  return c.json({
    id: user.id,
    email: pii.email,
    displayName: pii.displayName,
    /** Changes when the profile photo changes; null = no photo. */
    photoVersion: profile.photoVersion,
    /** False until the "about you" step after signing up has been filled in or skipped. */
    profileSet: user.profileSetAt !== null,
    level: user.level,
    /** True for the owners listed in ADMIN_EMAILS: the app then shows the way to the admin panel. */
    isAdmin,
    plan: planOf(user),
    /** When the paid plan runs out; null on the free plan. */
    planUntil: planOf(user) === 'free' ? null : user.planUntil,
    xp: user.xp,
    currentStreak: streakNow(user.currentStreak, user.lastActiveDate, localDay(safeTimezone(user.timezone)), user.streakFreezes).streak,
    freezes: user.streakFreezes,
    longestStreak: user.longestStreak,
  })
})
