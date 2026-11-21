import { and, eq, or, sql } from 'drizzle-orm'
import { MESSAGES_MIN_AGE, type MessagingBlock } from '../../shared/social'
import { isMember } from '../billing/plans'
import { db } from '../db/client'
import { dmThreads, follows, userBlocks, users } from '../db/schema'
import { ageOf } from '../pii'

/** The two ids of a pair in the order the conversation table keeps them. */
export const pairOf = (one: string, other: string): [string, string] => (one < other ? [one, other] : [other, one])

export async function threadBetween(one: string, other: string) {
  const [a, b] = pairOf(one, other)
  const [thread] = await db.select().from(dmThreads).where(and(eq(dmThreads.userA, a), eq(dmThreads.userB, b))).limit(1)
  return thread ?? null
}

/** True if either of the two has blocked the other. */
export async function blockedBetween(one: string, other: string): Promise<boolean> {
  const rows = await db
    .select({ id: userBlocks.blockerId })
    .from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, one), eq(userBlocks.blockedId, other)), and(eq(userBlocks.blockerId, other), eq(userBlocks.blockedId, one))))
    .limit(1)
  return rows.length > 0
}

/** Everyone the student has blocked, and everyone who has blocked the student. */
export async function blockedIds(userId: string): Promise<Set<string>> {
  const rows = await db.select().from(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)))
  return new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)))
}

/** Why this student may not write private messages; null if they may. */
export async function messagingBlock(user: typeof users.$inferSelect): Promise<MessagingBlock> {
  if (user.dmBannedAt) return 'banned'
  // Teachers and the owner write on behalf of Talkreal: no plan, age question or rules screen for them.
  if (user.teacherAt) return null
  if (!isMember(user)) return 'pro'
  const age = await ageOf(user.id)
  if (age !== null && age < MESSAGES_MIN_AGE) return 'age'
  if (!user.dmRulesAt) return 'rules'
  return null
}

/** How many messages are waiting for the student, across all conversations. */
export async function unreadFor(userId: string): Promise<number> {
  const result = (await db.execute(sql`
    select count(*)::int as n
    from dm_messages m join dm_threads t on t.id = m.thread_id
    where m.status = 'sent' and m.sender_id <> ${userId} and t.status <> 'declined'
      and ((t.user_a = ${userId} and (t.read_at_a is null or m.created_at > t.read_at_a))
        or (t.user_b = ${userId} and (t.read_at_b is null or m.created_at > t.read_at_b)))
      and not exists (select 1 from user_blocks b where (b.blocker_id = ${userId} and b.blocked_id = m.sender_id) or (b.blocker_id = m.sender_id and b.blocked_id = ${userId}))
  `)) as unknown as { rows: { n: number }[] }
  return result.rows[0]?.n ?? 0
}

/** Everyone the student follows. */
export async function followedIds(userId: string): Promise<string[]> {
  return (await db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, userId)).limit(1000)).map((row) => row.id)
}
