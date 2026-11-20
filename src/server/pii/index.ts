/**
 * The ONLY module allowed to touch the user_pii table (152-FZ separation).
 * If personal data must later live on separate storage, only this file changes.
 */
import { eq, ilike, inArray, or } from 'drizzle-orm'
import { db } from '../db/client'
import { cleanProfile, type Profile } from '../../shared/profile'
import { userAvatars, userPii, users } from '../db/schema'

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
export async function linkTelegram(userId: string, telegramId: string, telegramUsername: string | null = null): Promise<boolean> {
  const owner = await findUserIdByTelegramId(telegramId)
  if (owner) return owner === userId
  await db
    .insert(userPii)
    .values({ userId, telegramId, telegramUsername })
    .onConflictDoUpdate({ target: userPii.userId, set: { telegramId, telegramUsername } })
  return true
}

/** Called at every Telegram login: the @name and first name are whatever Telegram says today. */
export async function noteTelegramProfile(userId: string, telegramUsername: string | null, displayName: string | null): Promise<void> {
  await db
    .update(userPii)
    .set({ telegramUsername, ...(displayName ? { displayName } : {}) })
    .where(eq(userPii.userId, userId))
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
  const found = new Map<string, { email: string | null; displayName: string | null; telegram: boolean; telegramId: string | null; telegramUsername: string | null }>()
  if (userIds.length === 0) return found
  const rows = await db.select().from(userPii).where(inArray(userPii.userId, userIds))
  for (const row of rows) found.set(row.userId, { email: row.email, displayName: row.displayName, telegram: row.telegramId !== null, telegramId: row.telegramId, telegramUsername: row.telegramUsername })
  return found
}

/** For the admin panel: the students whose email or name contains the text. */
export async function searchUserIds(text: string, limit = 500): Promise<string[]> {
  const pattern = `%${text.replace(/[%_\\]/g, '\\$&')}%`
  const rows = await db
    .select({ userId: userPii.userId })
    .from(userPii)
    .where(or(ilike(userPii.email, pattern), ilike(userPii.displayName, pattern), ilike(userPii.telegramUsername, pattern.replace('%@', '%')), eq(userPii.telegramId, text.trim())))
    .limit(limit)
  return rows.map((row) => row.userId)
}

/* ───────────── The student's own profile: name, photo and what they chose to tell ───────────── */

/** The profile as the app shows it. The age is worked out from the year of birth. */
export async function getProfile(userId: string): Promise<Profile & { photoVersion: number | null }> {
  const [row] = await db.select().from(userPii).where(eq(userPii.userId, userId)).limit(1)
  const [photo] = await db.select({ updatedAt: userAvatars.updatedAt }).from(userAvatars).where(eq(userAvatars.userId, userId)).limit(1)
  return {
    ...cleanProfile({
      name: row?.displayName,
      bio: row?.bio,
      city: row?.city,
      age: row?.birthYear ? new Date().getFullYear() - row.birthYear : null,
      gender: row?.gender,
      goals: row?.goals ?? [],
      interests: row?.interests ?? [],
      discoverable: row?.discoverable ?? false,
    }),
    // Changes whenever the photo changes, so the app knows to load the new one.
    photoVersion: photo ? photo.updatedAt.getTime() : null,
  }
}

export async function saveProfile(userId: string, profile: Profile): Promise<void> {
  const values = {
    displayName: profile.name,
    bio: profile.bio,
    city: profile.city,
    birthYear: profile.age === null ? null : new Date().getFullYear() - profile.age,
    gender: profile.gender,
    goals: profile.goals,
    interests: profile.interests,
    discoverable: profile.discoverable,
  }
  await db
    .insert(userPii)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userPii.userId, set: values })
}

export async function getAvatar(userId: string): Promise<{ mime: string; data: Buffer; version: number } | null> {
  const [row] = await db.select().from(userAvatars).where(eq(userAvatars.userId, userId)).limit(1)
  return row ? { mime: row.mime, data: Buffer.from(row.data, 'base64'), version: row.updatedAt.getTime() } : null
}

export async function saveAvatar(userId: string, mime: string, data: Buffer): Promise<number> {
  const updatedAt = new Date()
  const values = { mime, data: data.toString('base64'), updatedAt }
  await db
    .insert(userAvatars)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userAvatars.userId, set: values })
  return updatedAt.getTime()
}

export async function deleteAvatar(userId: string): Promise<void> {
  await db.delete(userAvatars).where(eq(userAvatars.userId, userId))
}

/** For the admin panel: how many students chose each reason for learning. */
export async function goalCounts(): Promise<Record<string, number>> {
  const rows = await db.select({ goals: userPii.goals }).from(userPii)
  const counts: Record<string, number> = {}
  for (const row of rows) for (const goal of row.goals ?? []) counts[goal] = (counts[goal] ?? 0) + 1
  return counts
}
