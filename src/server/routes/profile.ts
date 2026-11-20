import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { cleanProfile } from '../../shared/profile'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { lessonById } from '../content/lessons'
import { db } from '../db/client'
import { lessonProgress, reviewItems, userAchievements, users, voiceSessions } from '../db/schema'
import { env } from '../env'
import { deleteAvatar, getAvatar, getPii, getProfile, saveAvatar, saveProfile } from '../pii'

/** A profile photo arrives already shrunk by the app; anything bigger than this is refused. */
const MAX_PHOTO_BYTES = 300 * 1024

export const profileRoutes = new Hono<AuthEnv>()
profileRoutes.use('*', requireUser)

/** The student's own profile and the numbers shown on the profile screen. */
profileRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const progress = await db.select({ id: lessonProgress.lessonId }).from(lessonProgress).where(eq(lessonProgress.userId, userId))
  const [voice] = await db
    .select({ seconds: sql<number>`coalesce(sum(${voiceSessions.seconds}), 0)::int`, calls: sql<number>`count(*) filter (where ${voiceSessions.seconds} >= 30)::int` })
    .from(voiceSessions)
    .where(eq(voiceSessions.userId, userId))
  const [words] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), sql`${reviewItems.key} not like 'e:%'`))
  const [badges] = await db.select({ n: sql<number>`count(*)::int` }).from(userAchievements).where(eq(userAchievements.userId, userId))

  return c.json({
    profile: await getProfile(userId),
    stats: {
      joined: user.createdAt,
      lessons: progress.filter((p) => lessonById(p.id) !== undefined).length,
      tests: progress.filter((p) => lessonById(p.id) === undefined).length,
      words: words?.n ?? 0,
      callMinutes: Math.round((voice?.seconds ?? 0) / 60),
      calls: voice?.calls ?? 0,
      badges: badges?.n ?? 0,
    },
  })
})

/** Saves the profile. Also used by the "about you" step after signing up, including when it is skipped. */
profileRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  // Skipping the step keeps whatever is there and only remembers that the question was asked.
  if (body.skip !== true) await saveProfile(userId, cleanProfile(body))
  await db.update(users).set({ profileSetAt: new Date() }).where(eq(users.id, userId))
  return c.json({ profile: await getProfile(userId) })
})

/** What kind of picture the bytes really are, whatever the app claims. */
function sniff(data: Buffer): string | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (data.length > 12 && data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  return null
}

/** Sets or removes the profile photo. The picture is sent as a data address ("data:image/jpeg;base64,…"). */
profileRoutes.post('/photo', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  if (body.remove === true) {
    await deleteAvatar(userId)
    return c.json({ photoVersion: null })
  }
  const match = typeof body.image === 'string' ? /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null
  if (!match) return c.json({ error: 'invalid' }, 400)
  const data = Buffer.from(match[1], 'base64')
  if (data.length > MAX_PHOTO_BYTES) return c.json({ error: 'too_big' }, 413)
  const mime = sniff(data)
  if (!mime) return c.json({ error: 'invalid' }, 400)
  return c.json({ photoVersion: await saveAvatar(userId, mime, data) })
})

/**
 * A profile photo. For now a student sees only their own, and the owner sees everyone's in the
 * admin panel. When the community opens, this is where "who may see whom" will be decided.
 */
profileRoutes.get('/photo/:id', async (c) => {
  const id = c.req.param('id')
  const viewer = c.get('userId')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'not_found' }, 404)
  if (id !== viewer) {
    const email = (await getPii(viewer)).email?.toLowerCase()
    if (!email || !env.adminEmails.includes(email)) return c.json({ error: 'not_found' }, 404)
  }
  const photo = await getAvatar(id)
  if (!photo) return c.json({ error: 'not_found' }, 404)
  // The address carries the photo's version, so a saved copy can be kept for a long time.
  return c.body(new Uint8Array(photo.data), 200, { 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=31536000, immutable' })
})
