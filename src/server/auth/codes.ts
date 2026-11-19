import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { appSettings, authCodes } from '../db/schema'

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_WAIT_MS = 60 * 1000
const MAX_CODES_PER_HOUR = 5
const MAX_ATTEMPTS = 5
/**
 * A code that was just used still works for this long. Phones sometimes send the same code
 * twice (autofill, a double tap, a retry on a weak connection): the second request must log
 * the student in too, not tell them the code is no longer valid.
 */
const REUSE_GRACE_MS = 2 * 60 * 1000

const SECRET_KEY = 'auth_secret'
let secret: Promise<string> | null = null

/**
 * The secret that codes are hashed with. AUTH_SECRET if it is set; otherwise one is generated
 * once and kept in the database, so codes keep working when the server restarts.
 */
async function loadSecret(): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET
  await db
    .insert(appSettings)
    .values({ key: SECRET_KEY, value: randomBytes(32).toString('hex') })
    .onConflictDoNothing()
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SECRET_KEY)).limit(1)
  return row.value
}

function authSecret(): Promise<string> {
  secret ??= loadSecret().catch((err) => {
    secret = null
    throw err
  })
  return secret
}

async function hashCode(email: string, code: string): Promise<string> {
  return createHmac('sha256', await authSecret()).update(`${email}:${code}`).digest('hex')
}

export type IssueResult = { ok: true; code: string } | { ok: false; error: 'wait' | 'too_many'; retryAfter: number }

/** Creates a new 6-digit code for the email, limited to one per minute and five per hour. */
export async function issueCode(email: string): Promise<IssueResult> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recent = await db
    .select({ createdAt: authCodes.createdAt })
    .from(authCodes)
    .where(and(eq(authCodes.email, email), gt(authCodes.createdAt, hourAgo)))
    .orderBy(desc(authCodes.createdAt))

  if (recent.length > 0) {
    const sinceLast = Date.now() - recent[0].createdAt.getTime()
    if (sinceLast < RESEND_WAIT_MS) {
      return { ok: false, error: 'wait', retryAfter: Math.ceil((RESEND_WAIT_MS - sinceLast) / 1000) }
    }
  }
  if (recent.length >= MAX_CODES_PER_HOUR) {
    const oldest = recent[recent.length - 1].createdAt.getTime()
    return { ok: false, error: 'too_many', retryAfter: Math.ceil((oldest + 60 * 60 * 1000 - Date.now()) / 1000) }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.insert(authCodes).values({
    email,
    codeHash: await hashCode(email, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  })
  return { ok: true, code }
}

export type VerifyResult = 'ok' | 'wrong' | 'expired' | 'too_many_attempts'

/** Checks a code against the most recent one issued for the email. */
export async function verifyCode(email: string, code: string): Promise<VerifyResult> {
  const [latest] = await db
    .select()
    .from(authCodes)
    .where(eq(authCodes.email, email))
    .orderBy(desc(authCodes.createdAt))
    .limit(1)

  if (!latest) return 'expired'
  const usedRecently = latest.consumedAt !== null && Date.now() - latest.consumedAt.getTime() < REUSE_GRACE_MS
  if (latest.consumedAt !== null && !usedRecently) return 'expired'
  if (latest.consumedAt === null && latest.expiresAt.getTime() < Date.now()) return 'expired'
  if (latest.attempts >= MAX_ATTEMPTS) return 'too_many_attempts'

  const expected = Buffer.from(latest.codeHash, 'hex')
  const given = Buffer.from(await hashCode(email, code), 'hex')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await db
      .update(authCodes)
      .set({ attempts: sql`${authCodes.attempts} + 1` })
      .where(eq(authCodes.id, latest.id))
    return 'wrong'
  }

  // Marks the code as used. If another request did so a moment ago, that is fine: see REUSE_GRACE_MS.
  await db
    .update(authCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(authCodes.id, latest.id), isNull(authCodes.consumedAt)))
  return 'ok'
}
