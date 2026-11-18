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

/**
 * Creates the learner record and its personal-data record together.
 * Accounts are only created after the student ticked the consent box, so the moment is recorded.
 */
export async function createUserWithEmail(email: string, locale: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ locale, consentAt: new Date() }).returning({ id: users.id })
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
    const [user] = await tx.insert(users).values({ locale, consentAt: new Date() }).returning({ id: users.id })
    await tx.insert(userPii).values({ userId: user.id, telegramId, displayName })
    return user.id
  })
}

/** Where the bot can write to this student, if they have connected Telegram. */
export async function getTelegramId(userId: string): Promise<string | null> {
  const rows = await db.select({ telegramId: userPii.telegramId }).from(userPii).where(eq(userPii.userId, userId)).limit(1)
  return rows[0]?.telegramId ?? null
}

/** Connects a Telegram account to an existing student. False if that Telegram belongs to someone else. */
export async function linkTelegram(userId: string, telegramId: string): Promise<boolean> {
  const owner = await findUserIdByTelegramId(telegramId)
  if (owner) return owner === userId
  await db
    .insert(userPii)
    .values({ userId, telegramId })
    .onConflictDoUpdate({ target: userPii.userId, set: { telegramId } })
  return true
}

export async function getPii(userId: string) {
  const rows = await db
    .select({ email: userPii.email, displayName: userPii.displayName })
    .from(userPii)
    .where(eq(userPii.userId, userId))
    .limit(1)
  return rows[0] ?? { email: null, displayName: null }
}
