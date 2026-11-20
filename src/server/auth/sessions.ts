import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { db } from '../db/client'
import { sessions } from '../db/schema'
import { env } from '../env'

const COOKIE = 'tr_session'
/** A login lasts this long, counted from the last time the app was opened. */
const SESSION_DAYS = 365
/** The login is pushed forward at most this often, to avoid a database write on every request. */
const RENEW_AFTER_DAYS = 1
const DAY_MS = 24 * 60 * 60 * 1000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Logs the user in on this device: stores a session and sets the cookie. */
export async function startSession(c: Context, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS)
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt })
  sendCookie(c, token, expiresAt)
}

function sendCookie(c: Context, token: string, expiresAt: Date) {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
    // Browsers accept at most 400 days; both are sent because some honour only one of them.
    maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  })
}

/**
 * Pushes the login forward, so someone who keeps using the app is never asked to log in again.
 * Called when the app opens.
 */
export async function renewSession(c: Context): Promise<void> {
  const token = getCookie(c, COOKIE)
  if (!token) return
  const [row] = await db
    .select({ id: sessions.id, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1)
  if (!row || row.expiresAt.getTime() < Date.now()) return
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS)
  if (expiresAt.getTime() - row.expiresAt.getTime() < RENEW_AFTER_DAYS * DAY_MS) return
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.id))
  sendCookie(c, token, expiresAt)
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

/** The logged-in student's id, or null for a visitor. For routes that work with or without an account. */
export const optionalUserId = (c: Context) => currentUserId(c)

/** For WebSocket connections, which arrive outside the normal request flow. */
export async function userIdFromCookieHeader(header: string | undefined): Promise<string | null> {
  const token = header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1)
  if (!token) return null
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(decodeURIComponent(token))), gt(sessions.expiresAt, new Date())))
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
