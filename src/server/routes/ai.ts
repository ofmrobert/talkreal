import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { answerKey } from '../../shared/lesson'
import { isLevel } from '../../shared/levels'
import { isScenario } from '../../shared/scenarios'
import { TEACHERS, type TeacherId } from '../../shared/teachers'
import { askJson, clip, textAiAvailable, type Turn } from '../ai/text'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { limitsFor, planOf } from '../billing/plans'
import { lessonById } from '../content/lessons'
import { db } from '../db/client'
import { dailyUsage, users } from '../db/schema'
import { getProfile } from '../pii'
import { localDay, safeTimezone } from '../progress/streak'
import { chatPrompt } from '../voice/teachers'

/** How much of the conversation the AI sees: enough to stay on topic, little enough to stay cheap. */
const CHAT_MEMORY = 16
const MAX_MESSAGE_CHARS = 500

export const aiRoutes = new Hono<AuthEnv>()
aiRoutes.use('/chat', requireUser)
aiRoutes.use('/check-answer', requireUser)

const isTeacher = (value: unknown): value is TeacherId => TEACHERS.some((t) => t.id === value)

interface ChatAnswer {
  reply?: unknown
  correction?: { better?: unknown; why?: unknown } | null
}

/**
 * One step of a written chat with a teacher. The app sends the conversation so far (it is not
 * kept on the server) and gets the teacher's next message, plus a correction of the student's
 * last message if it had a mistake. An empty conversation asks the teacher to open it.
 */
aiRoutes.post('/chat', async (c) => {
  const [user] = await db.select().from(users).where(eq(users.id, c.get('userId'))).limit(1)
  const body = await c.req.json().catch(() => ({}))
  if (!user || !isLevel(user.level) || !isTeacher(body.teacher)) return c.json({ error: 'invalid' }, 400)
  if (!textAiAvailable()) return c.json({ error: 'unavailable' }, 503)

  const turns: Turn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: unknown) => typeof (m as Turn)?.text === 'string' && (m as Turn).text.trim())
    .slice(-CHAT_MEMORY)
    .map((m: Turn) => ({ role: m.role === 'teacher' ? 'teacher' : 'student', text: m.text.trim().slice(0, MAX_MESSAGE_CHARS) }))
  const opening = turns.length === 0
  if (!opening && turns[turns.length - 1].role !== 'student') return c.json({ error: 'invalid' }, 400)

  // Only the student's own messages count towards the daily allowance.
  const today = localDay(safeTimezone(body.tz ?? user.timezone))
  const limit = limitsFor(planOf(user)).textMessagesPerDay
  const [usage] = await db
    .select({ textMessages: dailyUsage.textMessages })
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, user.id), eq(dailyUsage.day, today)))
    .limit(1)
  const used = usage?.textMessages ?? 0
  if (!opening && used >= limit) return c.json({ error: 'limit' }, 403)

  const lesson = typeof body.lessonId === 'string' ? lessonById(body.lessonId) : undefined
  const scenario = !lesson && isScenario(body.scenario) ? body.scenario : undefined

  let answer: ChatAnswer
  try {
    answer = await askJson<ChatAnswer>({
      system: chatPrompt(body.teacher, user.level, { lesson, scenario, student: await getProfile(user.id) }),
      // The AI needs something to answer: an empty chat starts with a stage direction.
      turns: opening ? [{ role: 'student', text: '(The student has just opened the chat. Greet them and begin.)' }] : turns,
      temperature: 0.7,
      mock: () =>
        opening
          ? { reply: 'Hello! This is a test teacher. Write something.', correction: null }
          : {
              reply: `You wrote: "${turns[turns.length - 1].text}". Tell me more.`,
              correction: /\bi am agree\b/i.test(turns[turns.length - 1].text) ? { better: 'I agree.', why: 'Agree — глагол, am не нужен.' } : null,
            },
    })
  } catch (err) {
    console.error('Chat failed:', err instanceof Error ? err.message : err)
    return c.json({ error: 'ai_failed' }, 502)
  }
  const reply = clip(answer.reply, 800)
  if (!reply) return c.json({ error: 'ai_failed' }, 502)

  if (!opening) {
    await db
      .insert(dailyUsage)
      .values({ userId: user.id, day: today, textMessages: 1 })
      .onConflictDoUpdate({ target: [dailyUsage.userId, dailyUsage.day], set: { textMessages: sql`${dailyUsage.textMessages} + 1` } })
  }

  const better = clip(answer.correction?.better, 500)
  return c.json({
    reply,
    correction: better && !opening ? { better, why: clip(answer.correction?.why, 300) } : null,
    messagesLeft: Number.isFinite(limit) ? Math.max(0, limit - used - (opening ? 0 : 1)) : null,
  })
})

/** How many typed answers one student may send to the AI per day. Far more than lessons need; stops abuse. */
const CHECKS_PER_DAY = 80
const checks = new Map<string, { day: string; count: number }>()

/**
 * A second opinion on a typed translation that is not in the lesson's list of accepted answers:
 * there are often more correct ways to say something than a lesson can list.
 */
aiRoutes.post('/check-answer', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const source = clip(body.source, 300)
  const expected = clip(body.expected, 300)
  const given = clip(body.given, 300)
  if (!source || !expected || !given) return c.json({ error: 'invalid' }, 400)
  if (!textAiAvailable()) return c.json({ correct: false, checked: false })

  const userId = c.get('userId')
  const day = new Date().toISOString().slice(0, 10)
  const entry = checks.get(userId)
  const count = entry?.day === day ? entry.count : 0
  if (count >= CHECKS_PER_DAY) return c.json({ correct: false, checked: false })
  checks.set(userId, { day, count: count + 1 })

  try {
    const verdict = await askJson<{ correct?: unknown; note?: unknown }>({
      system: `You check one answer in an English course for Russian speakers. The student had to translate a Russian sentence into English by typing it.
Decide whether the student's answer is a fully correct translation: natural, grammatical English with the same meaning as the Russian sentence. The reference answer shows what the lesson practises; other wordings, synonyms and contracted forms are fine. Ignore capital letters and punctuation.
Be strict about real mistakes: a missing or wrong article, wrong tense, wrong verb form, wrong preposition, wrong word order, a misspelt word or a changed meaning all make the answer incorrect. If the answer avoids the grammar that the reference answer clearly practises, it is incorrect.
Return one JSON object: {"correct": true or false, "note": one short sentence in Russian — if correct, confirm it is another good way to say it; if incorrect, name the mistake}.`,
      turns: [{ role: 'student', text: `Russian sentence: ${source}\nReference answer: ${expected}\nStudent's answer: ${given}` }],
      temperature: 0,
      timeoutMs: 8_000,
      // The stand-in AI accepts the same words in another order.
      mock: () => {
        const sorted = (s: string) => answerKey(s).split(' ').sort().join(' ')
        const same = sorted(given) === sorted(expected)
        return { correct: same, note: same ? 'Так тоже можно сказать.' : 'Ответ отличается от правильного.' }
      },
    })
    return c.json({ correct: verdict.correct === true, checked: true, note: clip(verdict.note, 240) })
  } catch (err) {
    console.error('Answer check failed:', err instanceof Error ? err.message : err)
    return c.json({ correct: false, checked: false })
  }
})
