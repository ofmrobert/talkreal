import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { createTelegramLink, telegramAvailable } from '../auth/telegram'
import { db } from '../db/client'
import { users } from '../db/schema'
import { getTelegramId } from '../pii'
import { safeTimezone } from '../progress/streak'
import { countSubscriptions, pushPublicKey, readSubscription, removeSubscription, saveSubscription } from '../reminders/push'
import { sendReminder, testReminderText } from '../reminders/scheduler'

/** At most one test reminder per student in this many milliseconds. */
const TEST_EVERY_MS = 20_000
const lastTest = new Map<string, number>()

export const reminderRoutes = new Hono<AuthEnv>()
reminderRoutes.use('*', requireUser)

/** Everything the reminders section of the profile needs. */
reminderRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  return c.json({
    enabled: user.remindersEnabled,
    social: user.notifySocial,
    feed: user.notifyFeed,
    hour: user.reminderHour,
    telegram: { available: telegramAvailable(), linked: Boolean(await getTelegramId(userId)) },
    push: { publicKey: await pushPublicKey(), devices: await countSubscriptions(userId) },
  })
})

/** Switch reminders on/off, choose the hour, and keep the timezone and language up to date. */
reminderRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const changes: Partial<typeof users.$inferInsert> = {}
  if (typeof body.enabled === 'boolean') changes.remindersEnabled = body.enabled
  if (typeof body.social === 'boolean') changes.notifySocial = body.social
  if (typeof body.feed === 'boolean') changes.notifyFeed = body.feed
  if (Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23) changes.reminderHour = body.hour
  if (typeof body.tz === 'string') changes.timezone = safeTimezone(body.tz)
  if (body.lang === 'ru' || body.lang === 'en') changes.locale = body.lang
  if (Object.keys(changes).length > 0) await db.update(users).set(changes).where(eq(users.id, c.get('userId')))
  return c.json({ ok: true })
})

/** This phone agreed to notifications. */
reminderRoutes.post('/push', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const subscription = readSubscription(body.subscription)
  if (!subscription) return c.json({ error: 'invalid_subscription' }, 400)
  await saveSubscription(c.get('userId'), subscription)
  return c.json({ ok: true })
})

/** This phone no longer wants notifications. */
reminderRoutes.post('/push/remove', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (typeof body.endpoint === 'string') await removeSubscription(body.endpoint)
  return c.json({ ok: true })
})

/** A link that connects the student's Telegram to this account. */
reminderRoutes.post('/telegram/link', (c) => {
  const url = createTelegramLink(c.get('userId'))
  return url ? c.json({ url }) : c.json({ error: 'telegram_unavailable' }, 503)
})

/** Sends a sample reminder right now, so the student can see that it arrives. */
reminderRoutes.post('/test', async (c) => {
  const userId = c.get('userId')
  const last = lastTest.get(userId) ?? 0
  if (Date.now() - last < TEST_EVERY_MS) return c.json({ error: 'wait' }, 429)
  lastTest.set(userId, Date.now())

  const body = await c.req.json().catch(() => ({}))
  const lang = body.lang === 'en' ? 'en' : 'ru'
  const sent = await sendReminder(userId, testReminderText(lang), lang)
  return c.json({ telegram: sent.telegram, push: sent.push })
})
