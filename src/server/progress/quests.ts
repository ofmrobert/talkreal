import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { QUEST_CHEST_XP, QUESTS, QUESTS_PER_DAY, type Quest, type QuestId } from '../../shared/play'
import { textAiAvailable } from '../ai/text'
import { planOf } from '../billing/plans'
import { db } from '../db/client'
import { dailyQuests, dailyUsage, users } from '../db/schema'
import { voiceProvider } from '../voice/socket'
import { remainingVoiceSeconds } from '../voice/usage'
import { recordActivity } from './activity'
import { countDue } from './review'

type User = typeof users.$inferSelect

/**
 * Daily quests: three small goals a day, each worth bonus XP, plus a chest for doing all three.
 * The day's quests are chosen once, the first time the student opens the app that day, and only
 * from things they can really do today (no "talk to a teacher" when they have no minutes left).
 */

/** Picks the day's quests. The same student gets a different mix on different days. */
async function choose(user: User, day: string): Promise<QuestId[]> {
  const possible: QuestId[] = ['lessons', 'good']
  if ((await countDue(user.id, day)) > 0) possible.push('review')
  if (textAiAvailable()) possible.push('chat')
  if (voiceProvider() !== null && (await remainingVoiceSeconds(user.id, planOf(user), day)) >= QUESTS.talk.target * 60) possible.push('talk')

  const order = (id: QuestId) => createHash('sha1').update(`${user.id}|${day}|${id}`).digest('hex')
  possible.sort((a, b) => order(a).localeCompare(order(b)))
  return ['xp', ...possible.slice(0, QUESTS_PER_DAY - 1)]
}

async function todaysRow(user: User, day: string) {
  const find = () =>
    db
      .select()
      .from(dailyQuests)
      .where(and(eq(dailyQuests.userId, user.id), eq(dailyQuests.day, day)))
      .limit(1)
  const [row] = await find()
  if (row) return row
  await db
    .insert(dailyQuests)
    .values({ userId: user.id, day, quests: await choose(user, day), claimed: [] })
    .onConflictDoNothing()
  return (await find())[0]
}

async function progressOf(userId: string, day: string): Promise<Record<QuestId, number>> {
  const [usage] = await db
    .select()
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.day, day)))
    .limit(1)
  return {
    xp: usage?.xp ?? 0,
    lessons: usage?.lessonsDone ?? 0,
    good: usage?.goodLessons ?? 0,
    review: usage?.reviewsDone ?? 0,
    chat: usage?.textMessages ?? 0,
    talk: Math.floor((usage?.voiceSeconds ?? 0) / 60),
  }
}

/** The student's quests for the day, with how far along each one is. */
export async function questsFor(user: User, day: string) {
  const row = await todaysRow(user, day)
  const progress = await progressOf(user.id, day)
  const quests: Quest[] = (row.quests as QuestId[])
    .filter((id) => id in QUESTS)
    .map((id) => {
      const rule = QUESTS[id]
      // XP earned by claiming quests does not count towards the "earn XP" quest: it would complete itself.
      const value = id === 'xp' ? progress.xp - row.bonusXp : progress[id]
      return { ...rule, progress: Math.max(0, Math.min(value, rule.target)), done: value >= rule.target, claimed: (row.claimed as string[]).includes(id) }
    })
  return { quests, chestXp: QUEST_CHEST_XP, chestOpened: quests.length > 0 && quests.every((q) => q.claimed) }
}

/**
 * Gives the XP for a finished quest. Safe against a double tap: the quest is marked as claimed
 * and paid for in one step, and a quest already claimed pays nothing.
 */
export async function claimQuest(user: User, day: string, timezone: string, id: string) {
  const state = await questsFor(user, day)
  const quest = state.quests.find((q) => q.id === id)
  if (!quest || !quest.done) return { ok: false as const, error: 'not_done' }
  if (quest.claimed) return { ok: false as const, error: 'claimed' }

  const last = state.quests.every((q) => q.claimed || q.id === id)
  const xp = quest.xp + (last ? QUEST_CHEST_XP : 0)
  const paid = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(dailyQuests)
      .where(and(eq(dailyQuests.userId, user.id), eq(dailyQuests.day, day)))
      .for('update')
      .limit(1)
    if (!row || (row.claimed as string[]).includes(id)) return false
    await tx
      .update(dailyQuests)
      .set({ claimed: [...(row.claimed as string[]), id], bonusXp: row.bonusXp + xp })
      .where(and(eq(dailyQuests.userId, user.id), eq(dailyQuests.day, day)))
    await recordActivity(tx, user, { today: day, timezone, xp, lessons: 0 })
    return true
  })
  if (!paid) return { ok: false as const, error: 'claimed' }
  return { ok: true as const, xp, chest: last, ...(await questsFor(user, day)) }
}
