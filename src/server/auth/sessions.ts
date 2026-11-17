import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { db } from '../db/client'
import { sessions } from '../db/schema'
import { env } from '../env'

const COOKIE = 'tr_session'
const SESSION_DAYS = 60

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Logs the user in on this device: stores a session and sets the cookie. */
export async function startSession(c: Context, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt })
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function endSession(c: Context): Promise<void> {
  const token = getCookie(c, COOKIE)
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  deleteCookie(c, COOKIE, { path: '/' })
}

async function currentUserId(c: Context): Promise<string | null> {
  const token = getCookie(c, COOKIE)
  if (!token) return null
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)
  return row?.userId ?? null
}

export type AuthEnv = { Variables: { userId: string } }

/** Protects a route: only logged-in users get through. */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  c.set('userId', userId)
  await next()
}
