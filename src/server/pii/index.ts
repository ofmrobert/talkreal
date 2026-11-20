/**
 * The ONLY module allowed to touch the user_pii table (152-FZ separation).
 * If personal data must later live on separate storage, only this file changes.
 */
import { eq, ilike, inArray, or } from 'drizzle-orm'
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
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ locale, consentAt: new Date() }).returning({ id: users.id })
      await tx.insert(userPii).values({ userId: user.id, email: normalizeEmail(email) })
      return user.id
    })
  } catch (err) {
    // The same person's second request created the account a moment earlier: use that one.
    const existing = await findUserIdByEmail(email)
    if (existing) return existing
    throw err
  }
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
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ locale, consentAt: new Date() }).returning({ id: users.id })
      await tx.insert(userPii).values({ userId: user.id, telegramId, displayName })
      return user.id
    })
  } catch (err) {
    const existing = await findUserIdByTelegramId(telegramId)
    if (existing) return existing
    throw err
  }
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

/** For the admin panel: email, name and whether Telegram is connected, for a list of students. */
export async function getPiiFor(userIds: string[]) {
  const found = new Map<string, { email: string | null; displayName: string | null; telegram: boolean }>()
  if (userIds.length === 0) return found
  const rows = await db.select().from(userPii).where(inArray(userPii.userId, userIds))
  for (const row of rows) found.set(row.userId, { email: row.email, displayName: row.displayName, telegram: row.telegramId !== null })
  return found
}

/** For the admin panel: the students whose email or name contains the text. */
export async function searchUserIds(text: string, limit = 500): Promise<string[]> {
  const pattern = `%${text.replace(/[%_\\]/g, '\\$&')}%`
  const rows = await db
    .select({ userId: userPii.userId })
    .from(userPii)
    .where(or(ilike(userPii.email, pattern), ilike(userPii.displayName, pattern)))
    .limit(limit)
  return rows.map((row) => row.userId)
}
