import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { GoalId, InterestId } from '../../shared/profile'
import {
  MESSAGE_MAX_LENGTH,
  MESSAGES_PER_DAY,
  NEW_CHATS_PER_DAY,
  REPORT_REASONS,
  type DirectMessage,
  type Inbox,
  type Person,
  type PublicProfile,
  type ReportReason,
  type ThreadPreview,
  type ThreadStatus,
  type ThreadView,
} from '../../shared/social'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { planOf } from '../billing/plans'
import { db } from '../db/client'
import { dmMessages, dmThreads, feedPosts, follows, socialReports, userBlocks, users } from '../db/schema'
import { openProfiles, openProfilesOf, tastesOf, type OpenProfile } from '../pii'
import { notices } from '../reminders/notify'
import { blockedBetween, blockedIds, messagingBlock, pairOf, threadBetween, unreadFor } from '../social/dm'
import { review } from '../social/moderation'
import { facesFor } from './feed'

/**
 * The community: practice partners, following, and private messages between students.
 * A student is found by others only if they switched "show my profile" on. Every private
 * message is read by the AI before it is delivered, and the owner can read conversations
 * in the admin panel; the privacy policy says so.
 */

export const socialRoutes = new Hono<AuthEnv>()
socialRoutes.use('*', requireUser)

const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value)
const DAY_MS = 24 * 60 * 60 * 1000
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']

async function load(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return user
}

/** Builds the cards for a list of students, in the order given. */
async function peopleFor(ids: string[], viewer: string, open: Map<string, OpenProfile>): Promise<Person[]> {
  if (ids.length === 0) return []
  const [faces, rows, mine, theirs, tastes] = await Promise.all([
    facesFor(ids, viewer),
    db.select({ id: users.id, level: users.level, streak: users.currentStreak }).from(users).where(inArray(users.id, ids)),
    db.select({ id: follows.followeeId }).from(follows).where(and(eq(follows.followerId, viewer), inArray(follows.followeeId, ids))),
    db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followeeId, viewer), inArray(follows.followerId, ids))),
    tastesOf(viewer),
  ])
  const byId = new Map(rows.map((row) => [row.id, row]))
  const following = new Set(mine.map((row) => row.id))
  const followsYou = new Set(theirs.map((row) => row.id))
  return ids
    .filter((id) => byId.has(id))
    .map((id) => {
      const shown = open.get(id)
      return {
        face: faces.get(id)!,
        level: byId.get(id)!.level,
        bio: shown?.bio ?? null,
        city: shown?.city ?? null,
        goals: (shown?.goals ?? []) as GoalId[],
        interests: (shown?.interests ?? []) as InterestId[],
        common: shown ? shown.interests.filter((i) => tastes.interests.includes(i)).length + shown.goals.filter((g) => tastes.goals.includes(g)).length : 0,
        streak: byId.get(id)!.streak,
        following: following.has(id),
        followsYou: followsYou.has(id),
      }
    })
}

/**
 * People to practise with. `tab` is 'suggested' (students who show their profile, the closest
 * matches first), 'following' or 'followers'; `q` searches the suggested ones by name.
 */
socialRoutes.get('/people', async (c) => {
  const user = await load(c.get('userId'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const tab = c.req.query('tab')
  const q = (c.req.query('q') ?? '').trim().slice(0, 40)
  const blocked = await blockedIds(user.id)
  const [{ followers }] = await db.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followeeId, user.id))
  const [{ following }] = await db.select({ following: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followerId, user.id))
  const counts = { followers, following }

  if (tab === 'following' || tab === 'followers') {
    const rows =
      tab === 'following'
        ? await db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, user.id)).orderBy(desc(follows.createdAt)).limit(200)
        : await db.select({ id: follows.followerId }).from(follows).where(eq(follows.followeeId, user.id)).orderBy(desc(follows.createdAt)).limit(200)
    const ids = rows.map((row) => row.id).filter((id) => !blocked.has(id))
    return c.json({ people: await peopleFor(ids, user.id, await openProfilesOf(ids)), counts })
  }

  const candidates = (await openProfiles(400, q || undefined)).filter((p) => p.userId !== user.id && !blocked.has(p.userId))
  const open = new Map(candidates.map((p) => [p.userId, p]))
  const all = await peopleFor([...open.keys()], user.id, open)
  const active = new Set(
    open.size ? (await db.select({ id: users.id }).from(users).where(and(inArray(users.id, [...open.keys()]), gte(users.lastActiveDate, new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10))))).map((row) => row.id) : [],
  )
  const myLevel = LEVELS.indexOf(user.level ?? '')
  const score = (person: Person) => {
    const gap = myLevel < 0 || !person.level ? 9 : Math.abs(LEVELS.indexOf(person.level) - myLevel)
    return (gap === 0 ? 4 : gap === 1 ? 2 : 0) + person.common * 2 + (active.has(person.face.userId) ? 3 : 0) + (person.followsYou ? 2 : 0) + (person.bio ? 1 : 0)
  }
  // A search shows everyone it finds; the suggestions leave out the people already followed.
  const people = all
    .filter((person) => q || !person.following)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 30)
  return c.json({ people, counts })
})

/** One student's profile as others see it. */
socialRoutes.get('/people/:id', async (c) => {
  const id = c.req.param('id')
  const viewer = await load(c.get('userId'))
  if (!viewer || !isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const open = await openProfilesOf([id])
  const [person] = await peopleFor([id], viewer.id, open)
  if (!person) return c.json({ error: 'not_found' }, 404)
  const me = id === viewer.id
  const [[{ followers }], [{ followingCount }], [{ posts }], [mine], thread, blocked] = await Promise.all([
    db.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followeeId, id)),
    db.select({ followingCount: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followerId, id)),
    db.select({ posts: sql<number>`count(*)::int` }).from(feedPosts).where(and(eq(feedPosts.authorId, id), eq(feedPosts.status, 'active'))),
    db.select({ id: userBlocks.blockedId }).from(userBlocks).where(and(eq(userBlocks.blockerId, viewer.id), eq(userBlocks.blockedId, id))).limit(1),
    me ? null : threadBetween(viewer.id, id),
    me ? false : blockedBetween(viewer.id, id),
  ])
  const profile: PublicProfile = {
    ...person,
    open: open.has(id) || me,
    followers,
    followingCount,
    posts,
    blocked: Boolean(mine),
    threadId: thread?.id ?? null,
    // A stranger can be written to only if they show their profile; an existing conversation stays open.
    canMessage: !me && !blocked && (open.has(id) || thread !== null),
    me,
  }
  return c.json({ profile })
})

socialRoutes.post('/people/:id/follow', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  if (!isUuid(id) || id === userId) return c.json({ error: 'not_found' }, 404)
  if (body.on === false) {
    await db.delete(follows).where(and(eq(follows.followerId, userId), eq(follows.followeeId, id)))
    return c.json({ following: false })
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
  if (!target) return c.json({ error: 'not_found' }, 404)
  if (await blockedBetween(userId, id)) return c.json({ error: 'blocked' }, 403)
  const added = await db.insert(follows).values({ followerId: userId, followeeId: id }).onConflictDoNothing().returning({ id: follows.followeeId })
  if (added.length > 0) notices.follower(id, userId, (await facesFor([userId], id)).get(userId)?.name ?? null)
  return c.json({ following: true })
})

/** Blocks or unblocks a student. Blocking also ends the following, both ways. */
socialRoutes.post('/people/:id/block', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  if (!isUuid(id) || id === userId) return c.json({ error: 'not_found' }, 404)
  if (body.on === false) {
    await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, id)))
    return c.json({ blocked: false })
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
  if (!target) return c.json({ error: 'not_found' }, 404)
  await db.insert(userBlocks).values({ blockerId: userId, blockedId: id }).onConflictDoNothing()
  await db.delete(follows).where(or(and(eq(follows.followerId, userId), eq(follows.followeeId, id)), and(eq(follows.followerId, id), eq(follows.followeeId, userId))))
  return c.json({ blocked: true })
})

/** A complaint about a student, with the conversation attached if there is one. The owner sees it in the admin panel. */
socialRoutes.post('/people/:id/report', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  if (!isUuid(id) || id === userId) return c.json({ error: 'not_found' }, 404)
  const reason = (REPORT_REASONS as readonly string[]).includes(body.reason) ? (body.reason as ReportReason) : 'other'
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
  if (!target) return c.json({ error: 'not_found' }, 404)
  const [today] = await db.select({ n: sql<number>`count(*)::int` }).from(socialReports).where(and(eq(socialReports.reporterId, userId), gte(socialReports.createdAt, new Date(Date.now() - DAY_MS))))
  if ((today?.n ?? 0) >= 20) return c.json({ error: 'slow_down' }, 429)
  const thread = await threadBetween(userId, id)
  await db.insert(socialReports).values({ reporterId: userId, aboutId: id, threadId: thread?.id ?? null, reason, note: typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null })
  return c.json({ ok: true })
})

/* ───────────── Private messages ───────────── */

const statusOf = (value: string): ThreadStatus => (value === 'open' || value === 'declined' ? value : 'request')

/** The student's conversations, newest first. A student on the free plan sees who wrote, not what. */
socialRoutes.get('/messages', async (c) => {
  const user = await load(c.get('userId'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const blocked = await blockedIds(user.id)
  const threads = (await db.select().from(dmThreads).where(or(eq(dmThreads.userA, user.id), eq(dmThreads.userB, user.id))).orderBy(desc(dmThreads.lastMessageAt)).limit(100)).filter((thread) => {
    const other = thread.userA === user.id ? thread.userB : thread.userA
    // A declined request disappears for the one who declined it; the one who asked still sees that they asked.
    return !blocked.has(other) && !(thread.status === 'declined' && thread.startedBy !== user.id)
  })
  const ids = threads.map((thread) => thread.id)
  const messages = ids.length ? await db.select().from(dmMessages).where(and(inArray(dmMessages.threadId, ids), eq(dmMessages.status, 'sent'))).orderBy(desc(dmMessages.createdAt)).limit(2000) : []
  const faces = await facesFor(threads.map((thread) => (thread.userA === user.id ? thread.userB : thread.userA)), user.id)
  const paid = planOf(user) !== 'free'

  const previews: ThreadPreview[] = threads
    .map((thread) => {
      const other = thread.userA === user.id ? thread.userB : thread.userA
      const readAt = thread.userA === user.id ? thread.readAtA : thread.readAtB
      const own = messages.filter((m) => m.threadId === thread.id)
      const last = own[0]
      return {
        id: thread.id,
        other: faces.get(other)!,
        status: statusOf(thread.status),
        incoming: thread.status === 'request' && thread.startedBy !== user.id,
        last: last ? { text: paid ? last.text : '', mine: last.senderId === user.id, at: last.createdAt.toISOString() } : null,
        unread: own.filter((m) => m.senderId !== user.id && (!readAt || m.createdAt > readAt)).length,
      }
    })
    .filter((preview) => preview.last !== null)
  const inbox: Inbox = { threads: previews, block: await messagingBlock(user), unread: previews.reduce((sum, p) => sum + p.unread, 0) }
  return c.json(inbox)
})

/** The student read the rules for private messages and confirms they are an adult. */
socialRoutes.post('/messages/rules', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (body.adult !== true) return c.json({ error: 'invalid' }, 400)
  await db.update(users).set({ dmRulesAt: new Date() }).where(eq(users.id, c.get('userId')))
  return c.json({ ok: true })
})

/** The conversation with one student. Opening it marks it as read. */
socialRoutes.get('/messages/with/:id', async (c) => {
  const id = c.req.param('id')
  const user = await load(c.get('userId'))
  if (!user || !isUuid(id) || id === user.id) return c.json({ error: 'not_found' }, 404)
  const [other] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
  if (!other) return c.json({ error: 'not_found' }, 404)
  const thread = await threadBetween(user.id, id)
  const block = await messagingBlock(user)
  const paid = planOf(user) !== 'free'
  const rows = thread ? await db.select().from(dmMessages).where(and(eq(dmMessages.threadId, thread.id), inArray(dmMessages.status, ['sent', 'hidden']))).orderBy(desc(dmMessages.createdAt)).limit(200) : []
  // Reading is part of the paid plans: only then is the conversation marked as read.
  if (thread && paid) await db.update(dmThreads).set(thread.userA === user.id ? { readAtA: new Date() } : { readAtB: new Date() }).where(eq(dmThreads.id, thread.id))

  const messages: DirectMessage[] = rows.reverse().map((row) => {
    const mine = row.senderId === user.id
    const hidden = row.status === 'hidden'
    return { id: row.id, text: hidden || !paid ? '' : row.text, mine, at: row.createdAt.toISOString(), better: mine && !hidden ? row.better : null, hidden }
  })
  const view: ThreadView = {
    id: thread?.id ?? '',
    other: (await facesFor([id], user.id)).get(id)!,
    status: thread ? statusOf(thread.status) : 'request',
    incoming: thread?.status === 'request' && thread.startedBy !== user.id,
    waiting: thread?.status === 'request' && thread.startedBy === user.id && messages.some((m) => m.mine),
    turnedDown: thread?.status === 'declined' && thread.startedBy === user.id,
    blocked: await blockedBetween(user.id, id),
    block,
    messages,
  }
  return c.json(view)
})

/** Accepts or declines a request to talk. */
socialRoutes.post('/messages/with/:id/answer', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const thread = await threadBetween(userId, id)
  if (!thread || thread.status !== 'request' || thread.startedBy === userId) return c.json({ error: 'not_found' }, 404)
  await db.update(dmThreads).set({ status: body.accept === true ? 'open' : 'declined' }).where(eq(dmThreads.id, thread.id))
  if (body.accept === true) notices.accepted(id, userId, (await facesFor([userId], id)).get(userId)?.name ?? null)
  return c.json({ status: body.accept === true ? 'open' : 'declined' })
})

/**
 * Sends a private message. The first message to someone is a request: the other student
 * accepts it (or simply answers) before the conversation goes on. The AI reads every message
 * first; one it refuses is kept for the owner to see and is never delivered.
 */
socialRoutes.post('/messages/with/:id', async (c) => {
  const id = c.req.param('id')
  const user = await load(c.get('userId'))
  const body = await c.req.json().catch(() => ({}))
  if (!user || !isUuid(id) || id === user.id) return c.json({ error: 'not_found' }, 404)
  const block = await messagingBlock(user)
  if (block) return c.json({ error: block }, 403)
  const text = typeof body.text === 'string' ? body.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MESSAGE_MAX_LENGTH) : ''
  if (text.length < 1) return c.json({ error: 'invalid' }, 400)
  const [other] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!other) return c.json({ error: 'not_found' }, 404)
  if (await blockedBetween(user.id, id)) return c.json({ error: 'blocked' }, 403)

  let thread = await threadBetween(user.id, id)
  if (!thread) {
    // Only students who show their profile can be written to by someone new.
    if (!(await openProfilesOf([id])).has(id)) return c.json({ error: 'closed' }, 403)
    const [started] = await db.select({ n: sql<number>`count(*)::int` }).from(dmThreads).where(and(eq(dmThreads.startedBy, user.id), gte(dmThreads.createdAt, new Date(Date.now() - DAY_MS))))
    if ((started?.n ?? 0) >= NEW_CHATS_PER_DAY) return c.json({ error: 'slow_down' }, 429)
  } else if (thread.status === 'declined' && thread.startedBy === user.id) return c.json({ error: 'declined' }, 403)
  else if (thread.status === 'request' && thread.startedBy === user.id) {
    const [sent] = await db.select({ n: sql<number>`count(*)::int` }).from(dmMessages).where(and(eq(dmMessages.threadId, thread.id), eq(dmMessages.senderId, user.id), eq(dmMessages.status, 'sent')))
    if ((sent?.n ?? 0) >= 1) return c.json({ error: 'waiting' }, 409)
  }
  const [today] = await db.select({ n: sql<number>`count(*)::int` }).from(dmMessages).where(and(eq(dmMessages.senderId, user.id), gte(dmMessages.createdAt, new Date(Date.now() - DAY_MS))))
  if ((today?.n ?? 0) >= MESSAGES_PER_DAY) return c.json({ error: 'slow_down' }, 429)

  const verdict = await review(text, MESSAGE_MAX_LENGTH)
  if (!thread) {
    const [a, b] = pairOf(user.id, id)
    await db.insert(dmThreads).values({ userA: a, userB: b, startedBy: user.id }).onConflictDoNothing()
    thread = await threadBetween(user.id, id)
    if (!thread) return c.json({ error: 'server_error' }, 500)
  }
  if (!verdict.ok) {
    await db.insert(dmMessages).values({ threadId: thread.id, senderId: user.id, text, status: 'rejected' })
    return c.json({ error: 'rejected' }, 422)
  }

  const [row] = await db.insert(dmMessages).values({ threadId: thread.id, senderId: user.id, text, better: verdict.better }).returning()
  // Answering a request accepts it; so does writing again to someone you had declined.
  const answered = thread.startedBy !== user.id && thread.status !== 'open'
  await db
    .update(dmThreads)
    .set({ lastMessageAt: row.createdAt, ...(thread.userA === user.id ? { readAtA: row.createdAt } : { readAtB: row.createdAt }), ...(answered ? { status: 'open' } : {}) })
    .where(eq(dmThreads.id, thread.id))

  const name = (await facesFor([user.id], id)).get(user.id)?.name ?? null
  // The first message is a request; an answer to a request tells the one who asked that it was accepted.
  if (thread.status === 'request' && thread.startedBy === user.id) notices.request(id, user.id, name)
  else if (answered) notices.accepted(id, user.id, name)
  else notices.message(id, user.id, name)

  const message: DirectMessage = { id: row.id, text: row.text, mine: true, at: row.createdAt.toISOString(), better: row.better, hidden: false }
  return c.json({ message, status: answered ? 'open' : statusOf(thread.status) })
})

/** For the dot on the Feed tab: how many messages are waiting. */
socialRoutes.get('/unread', async (c) => c.json({ unread: await unreadFor(c.get('userId')) }))
