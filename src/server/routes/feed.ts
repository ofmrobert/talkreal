import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { COMMENT_MAX_LENGTH, FREE_COMMENTS_PER_WEEK, POLL_XP, POST_MAX_LENGTH, POSTS_PER_DAY, REPORTS_TO_HIDE, type ChallengeState, type FeedComment, type FeedFace, type FeedPost, type FeedSummary, type PostKind } from '../../shared/feed'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { planOf } from '../billing/plans'
import { db } from '../db/client'
import { feedComments, feedImages, feedLikes, feedPostReports, feedPosts, feedReports, feedVotes, users } from '../db/schema'
import { publicFaces } from '../pii'
import { recordActivity } from '../progress/activity'
import { blockedIds, followedIds, unreadFor } from '../social/dm'
import { review } from '../social/moderation'
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
export async function facesFor(userIds: string[], viewer: string): Promise<Map<string, FeedFace>> {
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

/** How many posts of their own the student may still write today. */
async function postsLeftToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedPosts)
    .where(and(eq(feedPosts.authorId, userId), isNull(feedPosts.challengeId), gte(feedPosts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))))
  return Math.max(0, POSTS_PER_DAY - (row?.n ?? 0))
}

/** One post as the viewer may see it. A free student gets a student's post without its words. */
function shape(post: typeof feedPosts.$inferSelect, viewer: string, paid: boolean, faces: Map<string, FeedFace>) {
  const mine = post.authorId === viewer
  const locked = post.authorId !== null && !paid && !mine
  return {
    kind: (post.authorId ? 'student' : post.kind) as PostKind | 'challenge' | 'student',
    answerTo: post.challengeId,
    prize: post.prize,
    author: post.authorId ? (faces.get(post.authorId) ?? null) : null,
    mine,
    locked,
    body: locked ? { ...post.body, text: { ru: '', en: '' } } : post.body,
  }
}

/** The feed, newest first. `before` continues from an earlier page; `from` narrows it to the Talkreal account or to students. */
feedRoutes.get('/', async (c) => {
  const user = await load(c.get('userId'))
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const before = c.req.query('before')
  const cursor = before && !Number.isNaN(Date.parse(before)) ? lt(feedPosts.publishAt, new Date(before)) : undefined
  const from = c.req.query('from')
  const answersTo = c.req.query('challenge')
  const author = c.req.query('author')
  // "following": posts by the people the student follows. An id that cannot exist keeps the list empty when they follow nobody.
  const followed = from === 'following' ? await followedIds(user.id) : []
  const whose =
    answersTo && isUuid(answersTo)
      ? eq(feedPosts.challengeId, answersTo)
      : author && isUuid(author)
        ? eq(feedPosts.authorId, author)
        : from === 'official'
          ? isNull(feedPosts.authorId)
          : from === 'students'
            ? isNotNull(feedPosts.authorId)
            : from === 'following'
              ? inArray(feedPosts.authorId, followed.length ? followed : ['00000000-0000-0000-0000-000000000000'])
              : undefined
  // Posts by someone the student blocked, or who blocked the student, are left out.
  const blocked = [...(await blockedIds(user.id))]
  const unblocked = blocked.length ? or(isNull(feedPosts.authorId), notInArray(feedPosts.authorId, blocked)) : undefined
  const posts = await db.select().from(feedPosts).where(and(visible, cursor, whose, unblocked)).orderBy(desc(feedPosts.publishAt)).limit(PAGE)
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

  // The weekly challenges on this page: how many answered, whether the viewer did, and who won.
  const challengeIds = posts.filter((p) => p.kind === 'challenge' && !p.authorId).map((p) => p.id)
  const answers = challengeIds.length
    ? await db.select({ challengeId: feedPosts.challengeId, authorId: feedPosts.authorId, prize: feedPosts.prize }).from(feedPosts).where(and(inArray(feedPosts.challengeId, challengeIds), eq(feedPosts.status, 'active')))
    : []

  const authors = [...posts, ...answers.filter((a) => a.prize !== null)].map((p) => p.authorId).filter((id): id is string => id !== null)
  const faces = await facesFor([...new Set([...data.recent.map((r) => r.userId), ...authors])], user.id)
  const challengeOf = (post: (typeof posts)[number]): ChallengeState | undefined => {
    if (post.kind !== 'challenge' || post.authorId || !post.endsAt) return undefined
    const mine = answers.filter((a) => a.challengeId === post.id)
    return {
      endsAt: post.endsAt.toISOString(),
      open: post.endsAt.getTime() > Date.now(),
      answers: mine.length,
      answered: mine.some((a) => a.authorId === user.id),
      winners: mine
        .filter((a) => a.prize !== null && a.authorId)
        .sort((a, b) => b.prize! - a.prize!)
        .map((a) => ({ face: faces.get(a.authorId!)!, prize: a.prize! }))
        .filter((w) => w.face),
    }
  }
  const out: FeedPost[] = posts.map((post) => {
    const seen = shape(post, user.id, paid, faces)
    const myVote = data.myVotes.find((v) => v.id === post.id)?.choice ?? null
    const options = post.body.options?.length ?? 0
    const commenters = [...new Set(data.recent.filter((r) => r.id === post.id).map((r) => r.userId))].slice(0, 3)
    // The right answer and the explanation stay on the server until the student has answered.
    const body = myVote === null && post.kind === 'poll' ? { ...post.body, answer: undefined, explanation: undefined } : seen.body
    return {
      id: post.id,
      kind: seen.kind,
      challenge: challengeOf(post),
      answerTo: seen.answerTo,
      prize: seen.prize,
      author: seen.author,
      mine: seen.mine,
      locked: seen.locked,
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
    /** Reading and writing comments, and writing posts, are part of the paid plans. */
    canDiscuss: paid,
    postsLeft: paid ? await postsLeftToday(user.id) : 0,
    freeCommentsLeft: await freeCommentsLeft(user.id, paid),
    /** People who commented in the last week: the size of the conversation a free student is missing. */
    activeThisWeek: (await db.select({ n: sql<number>`count(distinct ${feedComments.userId})::int` }).from(feedComments).where(and(eq(feedComments.status, 'visible'), gte(feedComments.createdAt, new Date(Date.now() - WEEK_MS)))))[0]?.n ?? 0,
  })
})

/** The feed in brief: today's post, the running challenge, what is new since `since`, and who is active. */
feedRoutes.get('/summary', async (c) => {
  const userId = c.get('userId')
  const asked = Date.parse(c.req.query('since') ?? '')
  // Never further back than a week: an old phone must not show a huge number.
  const since = new Date(Math.max(Number.isNaN(asked) ? 0 : asked, Date.now() - WEEK_MS))
  const weekAgo = new Date(Date.now() - WEEK_MS)

  const [latest] = await db.select().from(feedPosts).where(and(visible, isNull(feedPosts.authorId), ne(feedPosts.kind, 'challenge'))).orderBy(desc(feedPosts.publishAt)).limit(1)
  const [challenge] = await db.select().from(feedPosts).where(and(visible, isNull(feedPosts.authorId), eq(feedPosts.kind, 'challenge'), gt(feedPosts.endsAt, sql`now()`))).orderBy(desc(feedPosts.publishAt)).limit(1)
  const answers = challenge ? await db.select({ authorId: feedPosts.authorId }).from(feedPosts).where(and(eq(feedPosts.challengeId, challenge.id), eq(feedPosts.status, 'active'))) : []
  const [fresh] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedPosts)
    .where(and(visible, gt(feedPosts.publishAt, since), or(isNull(feedPosts.authorId), ne(feedPosts.authorId, userId))))

  // Who is taking part this week: the authors of posts and of comments, newest first.
  const writers = await db.select({ userId: feedPosts.authorId, at: feedPosts.publishAt }).from(feedPosts).where(and(visible, isNotNull(feedPosts.authorId), gte(feedPosts.publishAt, weekAgo))).orderBy(desc(feedPosts.publishAt)).limit(300)
  const talkers = await db.select({ userId: feedComments.userId, at: feedComments.createdAt }).from(feedComments).where(and(eq(feedComments.status, 'visible'), gte(feedComments.createdAt, weekAgo))).orderBy(desc(feedComments.createdAt)).limit(300)
  const active = [...new Set([...writers, ...talkers].sort((a, b) => b.at.getTime() - a.at.getTime()).map((row) => row.userId).filter((id): id is string => id !== null))]
  const faces = await facesFor(active.filter((id) => id !== userId).slice(0, 3), userId)

  const summary: FeedSummary = {
    latest: latest ? { kind: latest.kind as PostKind, emoji: latest.body.emoji, title: latest.body.title } : null,
    challenge: challenge?.endsAt ? { title: challenge.body.title, endsAt: challenge.endsAt.toISOString(), answers: answers.length, answered: answers.some((a) => a.authorId === userId) } : null,
    fresh: fresh?.n ?? 0,
    unreadMessages: await unreadFor(userId),
    activeThisWeek: active.length,
    faces: [...faces.values()],
  }
  return c.json(summary)
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
  const [post] = await db.select({ id: feedPosts.id, authorId: feedPosts.authorId }).from(feedPosts).where(and(eq(feedPosts.id, id), visible)).limit(1)
  if (!post) return c.json({ error: 'not_found' }, 404)
  if (post.authorId && post.authorId !== userId) {
    const liker = await load(userId)
    if (!liker || planOf(liker) === 'free') return c.json({ error: 'pro' }, 403)
  }
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
  const [post] = await db.select({ id: feedPosts.id, authorId: feedPosts.authorId }).from(feedPosts).where(and(eq(feedPosts.id, id), visible)).limit(1)
  if (!post) return c.json({ error: 'not_found' }, 404)

  const paid = planOf(user) !== 'free'
  // The free comment of the week is for the Talkreal account's posts; students' posts are the community itself.
  if (!paid && post.authorId && post.authorId !== user.id) return c.json({ error: 'pro' }, 403)
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

/**
 * A student writes a post of their own. Like a comment, it is read by the AI first: unfit ones
 * are refused, and a mistake in the English comes back as a suggestion unless `confirm` is sent.
 */
feedRoutes.post('/posts', async (c) => {
  const user = await load(c.get('userId'))
  const body = await c.req.json().catch(() => ({}))
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  if (planOf(user) === 'free') return c.json({ error: 'pro' }, 403)
  const text = typeof body.text === 'string' ? body.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, POST_MAX_LENGTH) : ''
  if (text.length < 5) return c.json({ error: 'invalid' }, 400)
  // An answer to the weekly challenge: one per student, while the challenge is open. It does not use up the day's posts.
  const challengeId = typeof body.challengeId === 'string' && isUuid(body.challengeId) ? body.challengeId : null
  if (body.challengeId && !challengeId) return c.json({ error: 'not_found' }, 404)
  if (challengeId) {
    const [challenge] = await db.select({ id: feedPosts.id }).from(feedPosts).where(and(eq(feedPosts.id, challengeId), eq(feedPosts.kind, 'challenge'), isNull(feedPosts.authorId), gt(feedPosts.endsAt, sql`now()`), visible)).limit(1)
    if (!challenge) return c.json({ error: 'closed' }, 410)
    const [already] = await db.select({ id: feedPosts.id }).from(feedPosts).where(and(eq(feedPosts.challengeId, challengeId), eq(feedPosts.authorId, user.id))).limit(1)
    if (already) return c.json({ error: 'answered' }, 409)
  } else if ((await postsLeftToday(user.id)) === 0) return c.json({ error: 'slow_down' }, 429)

  const verdict = await review(text, POST_MAX_LENGTH)
  if (!verdict.ok) return c.json({ error: 'rejected' }, 422)
  if (verdict.better && body.confirm !== true) return c.json({ suggestion: verdict.better })

  const [row] = await db
    .insert(feedPosts)
    // Shown a moment in the past, so it is in the feed the instant it is saved.
    .values({ kind: 'student', body: { emoji: '', title: { ru: '', en: '' }, text: { ru: text, en: text } }, authorId: user.id, challengeId, publishAt: new Date(Date.now() - 1000), writtenBy: 'student' })
    .returning()
  const faces = await facesFor([user.id], user.id)
  const post: FeedPost = { id: row.id, ...shape(row, user.id, true, faces), publishedAt: row.publishAt.toISOString(), hasImage: false, likes: 0, liked: false, vote: null, votes: null, comments: 0, commenters: [] }
  return c.json({ post, postsLeft: await postsLeftToday(user.id) })
})

/** Removes the student's own post, with its likes and comments. */
feedRoutes.post('/posts/:id/delete', async (c) => {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const removed = await db.delete(feedPosts).where(and(eq(feedPosts.id, id), eq(feedPosts.authorId, c.get('userId')))).returning({ id: feedPosts.id })
  return removed.length ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
})

/** Reports a student's post. Each student counts once; enough reports hide the post until the owner looks. */
feedRoutes.post('/posts/:id/report', async (c) => {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const [post] = await db.select({ id: feedPosts.id }).from(feedPosts).where(and(eq(feedPosts.id, id), isNotNull(feedPosts.authorId))).limit(1)
  if (!post) return c.json({ error: 'not_found' }, 404)
  const added = await db.insert(feedPostReports).values({ postId: id, userId: c.get('userId') }).onConflictDoNothing().returning({ id: feedPostReports.postId })
  if (added.length > 0) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(feedPostReports).where(eq(feedPostReports.postId, id))
    await db.update(feedPosts).set({ reports: n, ...(n >= REPORTS_TO_HIDE ? { status: 'hidden' } : {}) }).where(eq(feedPosts.id, id))
  }
  return c.json({ ok: true })
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
