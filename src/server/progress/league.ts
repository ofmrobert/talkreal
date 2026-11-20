import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm'
import { LEAGUE_GROUP_SIZE, LEAGUE_TIERS, leagueZones, type LeagueRow } from '../../shared/play'
import { db } from '../db/client'
import { dailyUsage, leagueMembers } from '../db/schema'
import { publicFaces } from '../pii'
import type { Tx } from './activity'
import { dayAfter, localDay } from './streak'

/**
 * The weekly league. Everyone who earns XP in a week is put in a group of up to thirty students
 * of the same league; the week's XP decides the places. When the next week starts, the top of
 * each group moves up a league and the bottom moves down.
 *
 * Weeks run Monday to Sunday on Moscow time, the same for everyone, so a group shares one clock.
 */
const ZONE = 'Europe/Moscow'
const TOP_TIER = LEAGUE_TIERS.length - 1

/** The Monday of the week a day belongs to, as YYYY-MM-DD. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const sinceMonday = (d.getUTCDay() + 6) % 7
  return dayAfter(day, -sinceMonday)
}

export const currentWeek = () => weekOf(localDay(ZONE))

/** Reads either through the open transaction or, outside one, straight from the database. */
type Reader = Pick<Tx, 'select'>

/** Everyone in one group with their XP for that week, best first. Ties go to whoever joined the group earlier. */
async function standings(week: string, tier: number, groupNo: number, q: Reader = db) {
  return q
    .select({
      userId: leagueMembers.userId,
      xp: sql<number>`coalesce(sum(${dailyUsage.xp}), 0)::int`,
    })
    .from(leagueMembers)
    .leftJoin(dailyUsage, and(eq(dailyUsage.userId, leagueMembers.userId), gte(dailyUsage.day, week), lte(dailyUsage.day, dayAfter(week, 6))))
    .where(and(eq(leagueMembers.week, week), eq(leagueMembers.tier, tier), eq(leagueMembers.groupNo, groupNo)))
    .groupBy(leagueMembers.userId, leagueMembers.joinedAt)
    .orderBy(desc(sql`coalesce(sum(${dailyUsage.xp}), 0)`), leagueMembers.joinedAt)
}

/** The league a student starts this week in, from how their last week ended. */
async function tierForNewWeek(userId: string, week: string, q: Reader = db): Promise<number> {
  const [last] = await q
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), lt(leagueMembers.week, week)))
    .orderBy(desc(leagueMembers.week))
    .limit(1)
  if (!last) return 0
  // Away for a week or more: they come back where they were, neither rewarded nor punished.
  if (last.week !== dayAfter(week, -7)) return last.tier

  const table = await standings(last.week, last.tier, last.groupNo, q)
  const place = table.findIndex((row) => row.userId === userId)
  const xp = table[place]?.xp ?? 0
  const zones = leagueZones(table.length)
  if (xp > 0 && place < zones.up) return Math.min(TOP_TIER, last.tier + 1)
  if (place >= table.length - zones.down) return Math.max(0, last.tier - 1)
  return last.tier
}

/**
 * Puts the student in a group for this week if they are not in one yet. Called whenever XP is
 * earned, so the league only ever contains people who are actually studying this week.
 */
export async function joinLeague(tx: Tx, userId: string): Promise<void> {
  const week = currentWeek()
  const [mine] = await tx
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.week, week)))
    .limit(1)
  if (mine) return

  // Everything is read through the same transaction: a second connection would wait for this one forever.
  const tier = await tierForNewWeek(userId, week, tx)
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.week, week), eq(leagueMembers.tier, tier)))
  await tx
    .insert(leagueMembers)
    .values({ userId, week, tier, groupNo: Math.floor(n / LEAGUE_GROUP_SIZE) })
    .onConflictDoNothing()
}

/** The student's league this week: the table of their group, their place, and what is at stake. */
export async function leagueFor(userId: string) {
  const week = currentWeek()
  const today = localDay(ZONE)
  const daysLeft = 7 - Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${week}T12:00:00Z`)) / 86_400_000)
  const [mine] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.week, week)))
    .limit(1)

  // Not in a group yet: they join with their first XP of the week.
  if (!mine) return { joined: false as const, tier: await tierForNewWeek(userId, week), daysLeft, rows: [] as LeagueRow[], zones: { up: 0, down: 0 }, topTier: TOP_TIER }

  const table = await standings(week, mine.tier, mine.groupNo)
  const faces = await publicFaces(table.map((row) => row.userId))
  const rows: LeagueRow[] = table.map((row, index) => {
    const face = faces.get(row.userId)
    return {
      rank: index + 1,
      // The student always sees their own name; others only if those students agreed to be seen.
      name: row.userId === userId ? (face?.ownName ?? null) : (face?.name ?? null),
      tag: row.userId.replace(/-/g, '').slice(0, 3).toUpperCase(),
      userId: row.userId,
      photoVersion: row.userId === userId ? (face?.ownPhoto ?? null) : (face?.photo ?? null),
      xp: row.xp,
      me: row.userId === userId,
    }
  })
  return { joined: true as const, tier: mine.tier, daysLeft, rows, zones: leagueZones(rows.length), topTier: TOP_TIER }
}
