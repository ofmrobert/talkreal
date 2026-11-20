import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { db } from '../db/client'
import { users } from '../db/schema'
import { leagueFor } from '../progress/league'
import { claimQuest, questsFor } from '../progress/quests'
import { localDay, safeTimezone } from '../progress/streak'

/** The game layer: daily quests and the weekly league. */
export const playRoutes = new Hono<AuthEnv>()
playRoutes.use('/quests', requireUser)
playRoutes.use('/quests/*', requireUser)
playRoutes.use('/league', requireUser)

async function load(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return user
}

/** Today's three quests and how far along they are. */
playRoutes.get('/quests', async (c) => {
  const user = await load(c.get('userId'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  return c.json(await questsFor(user, localDay(safeTimezone(c.req.query('tz') ?? user.timezone))))
})

/** Collects the XP for a finished quest. */
playRoutes.post('/quests/claim', async (c) => {
  const user = await load(c.get('userId'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json().catch(() => ({}))
  const timezone = safeTimezone(body.tz ?? user.timezone)
  const result = await claimQuest(user, localDay(timezone), timezone, String(body.id ?? ''))
  return result.ok ? c.json(result) : c.json({ error: result.error }, 409)
})

/** The student's league group this week. */
playRoutes.get('/league', async (c) => c.json(await leagueFor(c.get('userId'))))
