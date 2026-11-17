/**
 * The ONLY module allowed to touch the user_pii table (152-FZ separation).
 * If personal data must later live on separate storage, only this file changes.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { userPii, users } from '../db/schema'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const rows = await db
    .select({ userId: userPii.userId })
    .from(userPii)
    .where(eq(userPii.email, normalizeEmail(email)))
    .limit(1)
  return rows[0]?.userId ?? null
}

/** Creates the learner record and its personal-data record together. */
export async function createUserWithEmail(email: string, locale: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ locale }).returning({ id: users.id })
    await tx.insert(userPii).values({ userId: user.id, email: normalizeEmail(email) })
    return user.id
  })
}

export async function findUserIdByTelegramId(telegramId: string): Promise<string | null> {
  const rows = await db
    .select({ userId: userPii.userId })
    .from(userPii)
    .where(eq(userPii.telegramId, telegramId))
    .limit(1)
  return rows[0]?.userId ?? null
}

export async function createUserWithTelegram(
  telegramId: string,
  displayName: string | null,
  locale: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ locale }).returning({ id: users.id })
    await tx.insert(userPii).values({ userId: user.id, telegramId, displayName })
    return user.id
  })
}

export async function getPii(userId: string) {
  const rows = await db
    .select({ email: userPii.email, displayName: userPii.displayName })
    .from(userPii)
    .where(eq(userPii.userId, userId))
    .limit(1)
  return rows[0] ?? { email: null, displayName: null }
}
