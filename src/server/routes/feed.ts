import { and, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { COMMENT_MAX_LENGTH, FREE_COMMENTS_PER_WEEK, POLL_XP, REPORTS_TO_HIDE, type FeedComment, type FeedFace, type FeedPost, type PostKind } from '../../shared/feed'
import { askJson, clip, textAiAvailable } from '../ai/text'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { planOf } from '../billing/plans'
import { db } from '../db/client'
import { feedComments, feedImages, feedLikes, feedPosts, feedReports, feedVotes, users } from '../db/schema'
import { publicFaces } from '../pii'
import { recordActivity } from '../progress/activity'
import { localDay, safeTimezone } from '../progress/streak'

const PAGE = 10
/** A paying student may write this many comments a day: far more than a conversation needs, and a brake on flooding. */
const COMMENTS_PER_DAY = 30
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const feedRoutes = new Hono<AuthEnv>()
feedRoutes.use('*', requireUser)

const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value)
const visible = and(eq(feedPosts.status, 'active'), lte(feedPosts.publishAt, sql`now()`))

async function load(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return user
}

/** How someone appears to other students: their name and photo if they allowed it, otherwise "Student" and a short code. */
async function facesFor(userIds: string[], viewer: string): Promise<Map<string, FeedFace>> {
  const known = await publicFaces(userIds)
  return new Map(
    userIds.map((id) => {
      const face = known.get(id)
      const own = id === viewer
      return [id, { userId: id, name: (own ? face?.ownName : face?.name) ?? null, tag: id.replace(/-/g, '').slice(0, 3).toUpperCase(), photoVersion: (own ? face?.ownPhoto : face?.photo) ?? null }]
    }),
  )
}

/** How many comments a free student has left this week. Null = no limit (a paid plan). */
async function freeCommentsLeft(userId: string, paid: boolean): Promise<number | null> {
  if (paid) return null
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedComments)
    .where(and(eq(feedComments.userId, userId), gte(feedComments.createdAt, new Date(Date.now() - WEEK_MS))))
  return Math.max(0, FREE_COMMENTS_PER_WEEK - (row?.n ?? 0))
}

/** The feed, newest first. `before` continues from an earlier page. */
feedRoutes.get('/', async (c) => {
  const user = await load(c.get('userId'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const before = c.req.query('before')
  const cursor = before && !Number.isNaN(Date.parse(before)) ? lt(feedPosts.publishAt, new Date(before)) : undefined
  const posts = await db.select().from(feedPosts).where(and(visible, cursor)).orderBy(desc(feedPosts.publishAt)).limit(PAGE)
  const ids = posts.map((p) => p.id)
  const paid = planOf(user) !== 'free'

  const empty = { likes: [], mine: [], votes: [], myVotes: [], comments: [], recent: [] }
  const data = ids.length
    ? {
        likes: await db.select({ id: feedLikes.postId, n: sql<number>`count(*)::int` }).from(feedLikes).where(inArray(feedLikes.postId, ids)).groupBy(feedLikes.postId),
        mine: await db.select({ id: feedLikes.postId }).from(feedLikes).where(and(inArray(feedLikes.postId, ids), eq(feedLikes.userId, user.id))),
        votes: await db.select({ id: feedVotes.postId, choice: feedVotes.choice, n: sql<number>`count(*)::int` }).from(feedVotes).where(inArray(feedVotes.postId, ids)).groupBy(feedVotes.postId, feedVotes.choice),
        myVotes: await db.select({ id: feedVotes.postId, choice: feedVotes.choice }).from(feedVotes).where(and(inArray(feedVotes.postId, ids), eq(feedVotes.userId, user.id))),
        comments: await db.select({ id: feedComments.postId, n: sql<number>`count(*)::int` }).from(feedComments).where(and(inArray(feedComments.postId, ids), eq(feedComments.status, 'visible'))).groupBy(feedComments.postId),
        recent: await db.select({ id: feedComments.postId, userId: feedComments.userId }).from(feedComments).where(and(inArray(feedComments.postId, ids), eq(feedComments.status, 'visible'))).orderBy(desc(feedComments.createdAt)).limit(200),
      }
    : empty

  const faces = await facesFor([...new Set(data.recent.map((r) => r.userId))], user.id)
  const out: FeedPost[] = posts.map((post) => {
    const myVote = data.myVotes.find((v) => v.id === post.id)?.choice ?? null
    const options = post.body.options?.length ?? 0
    const commenters = [...new Set(data.recent.filter((r) => r.id === post.id).map((r) => r.userId))].slice(0, 3)
    // The right answer and the explanation stay on the server until the student has answered.
    const body = myVote === null && post.kind === 'poll' ? { ...post.body, answer: undefined, explanation: undefined } : post.body
    return {
      id: post.id,
      kind: post.kind as PostKind,
      body,
      publishedAt: post.publishAt.toISOString(),
      hasImage: post.imageId !== null,
      likes: data.likes.find((l) => l.id === post.id)?.n ?? 0,
      liked: data.mine.some((l) => l.id === post.id),
      vote: myVote,
      votes: myVote === null ? null : Array.from({ length: options }, (_, i) => data.votes.find((v) => v.id === post.id && v.choice === i)?.n ?? 0),
      comments: data.comments.find((cm) => cm.id === post.id)?.n ?? 0,
      commenters: commenters.map((id) => faces.get(id)!).filter(Boolean),
    }
  })

  return c.json({
    posts: out,
    more: posts.length === PAGE ? posts[posts.length - 1].publishAt.toISOString() : null,
    /** Reading and writing comments is part of the paid plans. */
    canDiscuss: paid,
    freeCommentsLeft: await freeCommentsLeft(user.id, paid),
    /** People who commented in the last week: the size of the conversation a free student is missing. */
    activeThisWeek: (await db.select({ n: sql<number>`count(distinct ${feedComments.userId})::int` }).from(feedComments).where(and(eq(feedComments.status, 'visible'), gte(feedComments.createdAt, new Date(Date.now() - WEEK_MS)))))[0]?.n ?? 0,
  })
})

/** The picture of a post. */
feedRoutes.get('/:id/image', async (c) => {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const [post] = await db.select({ imageId: feedPosts.imageId }).from(feedPosts).where(and(eq(feedPosts.id, id), visible)).limit(1)
  if (!post?.imageId) return c.json({ error: 'not_found' }, 404)
  const [image] = await db.select().from(feedImages).where(eq(feedImages.id, post.imageId)).limit(1)
  if (!image) return c.json({ error: 'not_found' }, 404)
  return c.body(new Uint8Array(Buffer.from(image.data, 'base64')), 200, { 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=31536000, immutable' })
})

/** Likes or unlikes a post. */
feedRoutes.post('/:id/like', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const [post] = await db.select({ id: feedPosts.id }).from(feedPosts).where(and(eq(feedPosts.id, id), visible)).limit(1)
  if (!post) return c.json({ error: 'not_found' }, 404)
  const removed = await db.delete(feedLikes).where(and(eq(feedLikes.postId, id), eq(feedLikes.userId, userId))).returning({ id: feedLikes.postId })
  if (removed.length === 0) await db.insert(feedLikes).values({ postId: id, userId }).onConflictDoNothing()
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(feedLikes).where(eq(feedLikes.postId, id))
  return c.json({ liked: removed.length === 0, likes: n })
})

/** Answers a poll. The first answer counts, gives a little XP, and reveals the right one. */
feedRoutes.post('/:id/vote', async (c) => {
  const id = c.req.param('id')
  const user = await load(c.get('userId'))
  const body = await c.req.json().catch(() => ({}))
  if (!user || !isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const [post] = await db.select().from(feedPosts).where(and(eq(feedPosts.id, id), visible)).limit(1)
  const options = post?.body.options
  if (!post || post.kind !== 'poll' || !options) return c.json({ error: 'not_found' }, 404)
  const choice = Number(body.choice)
  if (!Number.isInteger(choice) || choice < 0 || choice >= options.length) return c.json({ error: 'invalid' }, 400)

  const timezone = safeTimezone(body.tz ?? user.timezone)
  const first = await db.transaction(async (tx) => {
    const added = await tx.insert(feedVotes).values({ postId: id, userId: user.id, choice }).onConflictDoNothing().returning({ id: feedVotes.postId })
    if (added.length === 0) return false
    await recordActivity(tx, user, { today: localDay(timezone), timezone, xp: POLL_XP, lessons: 0 })
    return true
  })
  const [mine] = await db.select({ choice: feedVotes.choice }).from(feedVotes).where(and(eq(feedVotes.postId, id), eq(feedVotes.userId, user.id))).limit(1)
  const counts = await db.select({ choice: feedVotes.choice, n: sql<number>`count(*)::int` }).from(feedVotes).where(eq(feedVotes.postId, id)).groupBy(feedVotes.choice)
  return c.json({
    vote: mine?.choice ?? choice,
    answer: post.body.answer ?? null,
    explanation: post.body.explanation ?? null,
    votes: options.map((_, i) => counts.find((v) => v.choice === i)?.n ?? 0),
    xp: first ? POLL_XP : 0,
  })
})

/** The comments under a post. Paying students see everyone's; a free student sees only their own. */
feedRoutes.get('/:id/comments', async (c) => {
  const id = c.req.param('id')
  const user = await load(c.get('userId'))
  if (!user || !isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const paid = planOf(user) !== 'free'
  const rows = await db
    .select()
    .from(feedComments)
    .where(and(eq(feedComments.postId, id), eq(feedComments.status, 'visible'), paid ? undefined : eq(feedComments.userId, user.id)))
    .orderBy(feedComments.createdAt)
    .limit(200)
  const faces = await facesFor([...new Set(rows.map((r) => r.userId))], user.id)
  const comments: FeedComment[] = rows.map((row) => ({ id: row.id, text: row.text, createdAt: row.createdAt.toISOString(), face: faces.get(row.userId)!, mine: row.userId === user.id }))
  return c.json({ comments, locked: !paid, freeCommentsLeft: await freeCommentsLeft(user.id, paid) })
})

interface Verdict {
  ok?: unknown
  better?: unknown
}

/**
 * Has the AI read a comment before it is posted: is it fit for a learning community, and is
 * its English right? Without an AI the comment is let through; reports and the admin panel remain.
 */
async function review(text: string): Promise<{ ok: boolean; better: string | null }> {
  if (!textAiAvailable()) return { ok: true, better: null }
  try {
    const verdict = await askJson<Verdict>({
      system: `You check one comment before it is posted in the feed of an English-learning app for adults. Comments are written by learners, usually in English, sometimes in Russian.
Return one JSON object: {"ok": true or false, "better": string or null}.
- "ok" is false only if the comment contains insults, harassment, hate, sexual content, threats, spam or advertising, links, or personal contact details (phone numbers, emails, messenger names). Disagreement, jokes and mistakes are fine.
- "better": if the comment is in English and has a real mistake in grammar, word choice or spelling, the same comment rewritten correctly, changing as little as possible. If it is already correct, is not in English, or "ok" is false, null. Ignore missing capital letters and final punctuation.`,
      turns: [{ role: 'student', text }],
      temperature: 0,
      timeoutMs: 12_000,
      mock: () => ({ ok: !/badword/i.test(text), better: /\bi am agree\b/i.test(text) ? text.replace(/\bi am agree\b/i, 'I agree') : null }),
    })
    const better = clip(verdict.better, COMMENT_MAX_LENGTH)
    return { ok: verdict.ok !== false, better: better && better !== text ? better : null }
  } catch (err) {
    console.error('Comment check failed:', err instanceof Error ? err.message : err)
    return { ok: true, better: null }
  }
}

/**
 * Posts a comment. If the English can be improved, the first try comes back with a suggestion
 * and nothing is posted; the app then sends the version the student chose with `confirm: true`.
 */
feedRoutes.post('/:id/comments', async (c) => {
  const id = c.req.param('id')
  const user = await load(c.get('userId'))
  const body = await c.req.json().catch(() => ({}))
  if (!user || !isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, COMMENT_MAX_LENGTH) : ''
  if (text.length < 2) return c.json({ error: 'invalid' }, 400)
  const [post] = await db.select({ id: feedPosts.id }).from(feedPosts).where(and(eq(feedPosts.id, id), visible)).limit(1)
  if (!post) return c.json({ error: 'not_found' }, 404)

  const paid = planOf(user) !== 'free'
  if ((await freeCommentsLeft(user.id, paid)) === 0) return c.json({ error: 'pro' }, 403)
  const [today] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedComments)
    .where(and(eq(feedComments.userId, user.id), gte(feedComments.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))))
  if ((today?.n ?? 0) >= COMMENTS_PER_DAY) return c.json({ error: 'slow_down' }, 429)

  const verdict = await review(text)
  if (!verdict.ok) return c.json({ error: 'rejected' }, 422)
  if (verdict.better && body.confirm !== true) return c.json({ suggestion: verdict.better })

  const [row] = await db.insert(feedComments).values({ postId: id, userId: user.id, text }).returning()
  const faces = await facesFor([user.id], user.id)
  const comment: FeedComment = { id: row.id, text: row.text, createdAt: row.createdAt.toISOString(), face: faces.get(user.id)!, mine: true }
  return c.json({ comment, freeCommentsLeft: await freeCommentsLeft(user.id, paid) })
})

/** Removes the student's own comment. */
feedRoutes.post('/comments/:id/delete', async (c) => {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const removed = await db.delete(feedComments).where(and(eq(feedComments.id, id), eq(feedComments.userId, c.get('userId')))).returning({ id: feedComments.id })
  return removed.length ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
})

/** Reports a comment. Each student counts once; enough reports hide the comment until the owner looks. */
feedRoutes.post('/comments/:id/report', async (c) => {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const [comment] = await db.select().from(feedComments).where(eq(feedComments.id, id)).limit(1)
  if (!comment) return c.json({ error: 'not_found' }, 404)
  const added = await db.insert(feedReports).values({ commentId: id, userId: c.get('userId') }).onConflictDoNothing().returning({ id: feedReports.commentId })
  if (added.length > 0) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(feedReports).where(eq(feedReports.commentId, id))
    await db.update(feedComments).set({ reports: n, ...(n >= REPORTS_TO_HIDE ? { status: 'hidden' } : {}) }).where(eq(feedComments.id, id))
  }
  return c.json({ ok: true })
})
