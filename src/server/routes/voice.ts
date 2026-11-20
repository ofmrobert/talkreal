import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { textAiAvailable } from '../ai/text'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { limitsFor, planOf } from '../billing/plans'
import { lessonById } from '../content/lessons'
import { db } from '../db/client'
import { dailyUsage, lessonProgress, users, voiceSessions } from '../db/schema'
import { localDay, safeTimezone } from '../progress/streak'
import { voiceProvider } from '../voice/socket'
import { remainingVoiceSeconds } from '../voice/usage'

export const voiceRoutes = new Hono<AuthEnv>()
voiceRoutes.use('*', requireUser)

/** Whether voice calls and text chat are switched on, how much the student has left today, and what they could practise. */
voiceRoutes.get('/status', async (c) => {
  const [user] = await db.select().from(users).where(eq(users.id, c.get('userId'))).limit(1)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const today = localDay(safeTimezone(c.req.query('tz') ?? user.timezone))
  const limits = limitsFor(planOf(user))

  const [usage] = await db
    .select({ textMessages: dailyUsage.textMessages })
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, user.id), eq(dailyUsage.day, today)))
    .limit(1)
  const messagesLeft = Number.isFinite(limits.textMessagesPerDay) ? Math.max(0, limits.textMessagesPerDay - (usage?.textMessages ?? 0)) : null

  // The lesson finished most recently: the natural thing to talk about next.
  const recent = await db
    .select({ lessonId: lessonProgress.lessonId })
    .from(lessonProgress)
    .where(eq(lessonProgress.userId, user.id))
    .orderBy(desc(lessonProgress.lastCompletedAt))
    .limit(5)
  const lastLesson = recent.map((r) => lessonById(r.lessonId)).find(Boolean)

  return c.json({
    available: voiceProvider() !== null,
    remainingSeconds: await remainingVoiceSeconds(user.id, planOf(user), today),
    dailySeconds: limits.voiceSecondsPerDay,
    chatAvailable: textAiAvailable(),
    /** Text messages left today; null = no limit. */
    messagesLeft,
    lastLesson: lastLesson ? { id: lastLesson.id, title: lastLesson.title } : null,
  })
})

/** The teacher's review of one call. The app asks until the status is no longer "pending". */
voiceRoutes.get('/calls/:id/report', async (c) => {
  const id = c.req.param('id')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'not_found' }, 404)
  const [call] = await db
    .select({ status: voiceSessions.reportStatus, report: voiceSessions.report })
    .from(voiceSessions)
    .where(and(eq(voiceSessions.id, id), eq(voiceSessions.userId, c.get('userId'))))
    .limit(1)
  if (!call) return c.json({ error: 'not_found' }, 404)
  return c.json({ status: call.status, report: call.status === 'ready' ? call.report : null })
})

/** The latest calls that have a review, newest first. */
voiceRoutes.get('/calls', async (c) => {
  const calls = await db
    .select({
      id: voiceSessions.id,
      teacher: voiceSessions.teacher,
      startedAt: voiceSessions.startedAt,
      seconds: voiceSessions.seconds,
      scenario: voiceSessions.scenario,
      report: voiceSessions.report,
    })
    .from(voiceSessions)
    .where(and(eq(voiceSessions.userId, c.get('userId')), eq(voiceSessions.reportStatus, 'ready')))
    .orderBy(desc(voiceSessions.startedAt))
    .limit(5)
  return c.json({ calls })
})
