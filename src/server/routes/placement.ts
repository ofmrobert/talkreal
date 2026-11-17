import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import placement from '../../../content/placement.json'
import { isLevel, LEVELS, type Level } from '../../shared/levels'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { db } from '../db/client'
import { placementResults, users } from '../db/schema'

type Answers = Record<string, number>

async function saveLevel(userId: string, level: Level, method: 'test' | 'self', answers?: Answers) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ level }).where(eq(users.id, userId))
    await tx.insert(placementResults).values({ userId, level, method, answers: answers ?? null })
  })
}

/**
 * Walks the levels from easiest to hardest. The student keeps going while they pass
 * (passMark correct out of a level's questions) and stops at the first level they don't pass.
 */
function evaluate(answers: Answers): { status: 'continue'; level: Level } | { status: 'done'; level: Level } {
  let reached: Level = LEVELS[0]
  for (const level of LEVELS) {
    const questions = placement.questions.filter((q) => q.level === level)
    if (questions.some((q) => typeof answers[q.id] !== 'number')) return { status: 'continue', level }
    const correct = questions.filter((q) => answers[q.id] === q.answer).length
    if (correct < placement.passMark) return { status: 'done', level: reached }
    reached = level
  }
  return { status: 'done', level: reached }
}

export const placementRoutes = new Hono<AuthEnv>()
placementRoutes.use('*', requireUser)

/** The questions, without the correct answers. */
placementRoutes.get('/questions', (c) =>
  c.json({
    questions: placement.questions.map(({ id, level, prompt, options }) => ({ id, level, prompt, options })),
  }),
)

/** Called after each level's block of questions with every answer given so far. */
placementRoutes.post('/submit', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const answers: Answers = {}
  if (body.answers && typeof body.answers === 'object') {
    for (const q of placement.questions) {
      const value = body.answers[q.id]
      if (Number.isInteger(value)) answers[q.id] = value
    }
  }
  const result = evaluate(answers)
  if (result.status === 'done') await saveLevel(c.get('userId'), result.level, 'test', answers)
  return c.json(result)
})

/** The student picks their level themselves. */
placementRoutes.post('/choose', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!isLevel(body.level)) return c.json({ error: 'invalid_level' }, 400)
  await saveLevel(c.get('userId'), body.level, 'self')
  return c.json({ status: 'done', level: body.level })
})
