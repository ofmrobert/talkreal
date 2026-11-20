import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { Hono, type MiddlewareHandler } from 'hono'
import { ACHIEVEMENTS } from '../../shared/achievements'
import { LEVELS } from '../../shared/levels'
import { PRICES } from '../../shared/plans'
import { textAiAvailable } from '../ai/text'
import { emailConfigured } from '../auth/email'
import { requireUser, type AuthEnv } from '../auth/sessions'
import { telegramAvailable } from '../auth/telegram'
import { planOf } from '../billing/plans'
import { isValidCode, normalizeCode } from '../billing/promo'
import { billingMode } from '../billing/yookassa'
import { lessonsFor } from '../content/lessons'
import { fillFeed, rewriteWaiting } from '../feed/generate'
import { writerName } from '../feed/writer'
import { examId, unitsFor } from '../content/units'
import { db, dbStatus } from '../db/client'
import {
  adminActions,
  dailyUsage,
  feedComments,
  feedPosts,
  lessonProgress,
  pageViews,
  payments,
  placementResults,
  promoCodes,
  pushSubscriptions,
  reviewItems,
  sessions,
  userAchievements,
  users,
  voiceSessions,
} from '../db/schema'
import { env } from '../env'
import { approvePhoto, clearBio, countNewPhotos, deleteAvatar, getPii, getPiiFor, getProfile, goalCounts, listPhotos, searchUserIds } from '../pii'
import { dayBefore, localDay } from '../progress/streak'
import { voiceProvider } from '../voice/socket'

/**
 * Everything behind the admin panel (/admin). Only the people listed in ADMIN_EMAILS get in;
 * everyone else is told the address does not exist.
 *
 * Days are counted on Moscow time, where most students are.
 */
const ZONE = 'Europe/Moscow'
const DAY_MS = 24 * 60 * 60 * 1000

const requireAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const email = (await getPii(c.get('userId'))).email?.toLowerCase()
  if (!email || !env.adminEmails.includes(email)) return c.json({ error: 'not_found' }, 404)
  await next()
}

export const adminRoutes = new Hono<AuthEnv>()
adminRoutes.use('*', requireUser, requireAdmin)

/** Runs a hand-written query and returns its rows. */
async function rows<T>(query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] }
  return result.rows
}

/** A whole number from the address bar, kept inside sensible bounds. */
function intParam(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback
}

/** The last `count` days as YYYY-MM-DD, oldest first, ending today (Moscow time). */
function lastDays(count: number): string[] {
  const days = [localDay(ZONE)]
  while (days.length < count) days.unshift(dayBefore(days[0]))
  return days
}

/** `interval 'N days'`, with N taken from our own code, never from the request as text. */
const interval = (days: number) => sql.raw(`interval '${Math.trunc(days)} days'`)

async function log(c: { get: (key: 'userId') => string }, action: string, target: string | null, details?: object) {
  await db
    .insert(adminActions)
    .values({ adminId: c.get('userId'), action, target, details: details ?? null })
    .catch((err) => console.error('Could not write the admin log:', err))
}

/* ───────────────────────────── Overview ───────────────────────────── */

adminRoutes.get('/overview', async (c) => {
  const days = intParam(c.req.query('days'), 30, 7, 365)
  const range = lastDays(days)
  const today = range[range.length - 1]
  const start = range[0]

  const [k] = await rows<Record<string, number>>(sql`
    select
      (select count(*)::int from users) as users,
      (select count(*)::int from users where created_at > now() - interval '1 day') as new_1d,
      (select count(*)::int from users where created_at > now() - interval '7 days') as new_7d,
      (select count(*)::int from users where created_at > now() - interval '30 days') as new_30d,
      (select count(*)::int from users where level is not null) as placed,
      (select count(distinct user_id)::int from daily_usage where day = ${today}::date) as dau,
      (select count(distinct user_id)::int from daily_usage where day > ${today}::date - 7) as wau,
      (select count(distinct user_id)::int from daily_usage where day > ${today}::date - 30) as mau,
      (select count(*)::int from users where plan in ('pro', 'max') and (plan_until is null or plan_until > now())) as paying,
      (select count(*)::int from users where plan = 'pro' and (plan_until is null or plan_until > now())) as paying_pro,
      (select count(*)::int from users where plan = 'max' and (plan_until is null or plan_until > now())) as paying_max,
      (select count(*)::int from users where plan in ('pro', 'max') and plan_until between now() and now() + interval '7 days') as expiring_7d,
      (select coalesce(sum(amount_rub), 0)::int from payments where status = 'paid') as revenue_all,
      (select coalesce(sum(amount_rub), 0)::int from payments where status = 'paid' and paid_at > now() - interval '30 days') as revenue_30d,
      (select coalesce(sum(amount_rub), 0)::int from payments where status = 'paid' and (paid_at at time zone ${ZONE})::date = ${today}::date) as revenue_today,
      (select count(*)::int from payments where status = 'paid') as payments_all,
      (select count(distinct user_id)::int from payments where status = 'paid') as buyers,
      (select coalesce(sum(lessons_done), 0)::int from daily_usage where day >= ${start}::date) as lessons,
      (select coalesce(sum(voice_seconds), 0)::int from daily_usage where day >= ${start}::date) as voice_seconds,
      (select coalesce(sum(text_messages), 0)::int from daily_usage where day >= ${start}::date) as text_messages,
      (select count(*)::int from voice_sessions where started_at > now() - ${interval(days)}) as calls,
      (select count(*)::int from review_items where due_day <= ${today}::date) as review_due,
      (select count(distinct visitor_id)::int from page_views where created_at > now() - ${interval(days)}) as visitors
  `)

  // What the current subscribers are worth per month: a yearly payment counts as a twelfth.
  const [mrr] = await rows<{ mrr: number }>(sql`
    select coalesce(sum(case when p.period = 'year' then p.amount_rub / 12.0 else p.amount_rub end), 0)::int as mrr
    from users u
    join lateral (select amount_rub, period from payments where user_id = u.id and status = 'paid' order by paid_at desc limit 1) p on true
    where u.plan in ('pro', 'max') and u.plan_until > now()
  `)

  const signups = await rows<{ d: string; n: number }>(sql`
    select to_char((created_at at time zone ${ZONE})::date, 'YYYY-MM-DD') as d, count(*)::int as n
    from users where (created_at at time zone ${ZONE})::date >= ${start}::date group by 1
  `)
  const activity = await rows<{ d: string; active: number; lessons: number; voice: number; texts: number }>(sql`
    select to_char(day, 'YYYY-MM-DD') as d, count(*)::int as active, coalesce(sum(lessons_done), 0)::int as lessons,
           coalesce(sum(voice_seconds), 0)::int as voice, coalesce(sum(text_messages), 0)::int as texts
    from daily_usage where day >= ${start}::date group by 1
  `)
  const revenue = await rows<{ d: string; rub: number; n: number }>(sql`
    select to_char((paid_at at time zone ${ZONE})::date, 'YYYY-MM-DD') as d, coalesce(sum(amount_rub), 0)::int as rub, count(*)::int as n
    from payments where status = 'paid' and (paid_at at time zone ${ZONE})::date >= ${start}::date group by 1
  `)
  const by = <T extends { d: string }>(list: T[]) => new Map(list.map((row) => [row.d, row]))
  const s = by(signups)
  const a = by(activity)
  const r = by(revenue)

  // Of the students who joined at least N days ago, the share who studied on their Nth day.
  const retention = []
  for (const n of [1, 7, 30]) {
    const [row] = await rows<{ eligible: number; retained: number }>(sql`
      select count(*)::int as eligible,
             count(*) filter (where exists (
               select 1 from daily_usage d where d.user_id = u.id and d.day = (u.created_at at time zone ${ZONE})::date + ${sql.raw(String(n))}
             ))::int as retained
      from users u
      where u.created_at < now() - ${interval(n + 1)} and u.created_at > now() - interval '180 days'
    `)
    retention.push({ day: n, ...row })
  }

  const [funnel] = await rows<Record<string, number>>(sql`
    select
      (select count(distinct visitor_id)::int from page_views) as visitors,
      (select count(*)::int from users) as signed_up,
      (select count(*)::int from users where level is not null) as chose_level,
      (select count(distinct user_id)::int from lesson_progress) as finished_lesson,
      (select count(distinct user_id)::int from voice_sessions where seconds >= 30) as made_call,
      (select count(distinct user_id)::int from payments where status = 'paid') as paid
  `)

  return c.json({
    days,
    kpi: { ...k, mrr: mrr?.mrr ?? 0, photos_to_review: await countNewPhotos() },
    series: range.map((day) => ({
      day,
      signups: s.get(day)?.n ?? 0,
      active: a.get(day)?.active ?? 0,
      lessons: a.get(day)?.lessons ?? 0,
      voiceMinutes: Math.round((a.get(day)?.voice ?? 0) / 60),
      messages: a.get(day)?.texts ?? 0,
      revenue: r.get(day)?.rub ?? 0,
      payments: r.get(day)?.n ?? 0,
    })),
    retention,
    funnel,
  })
})

/* ───────────────────────────── Users ───────────────────────────── */

const PAGE = 50
const paying = and(inArray(users.plan, ['pro', 'max']), or(isNull(users.planUntil), gt(users.planUntil, sql`now()`)))

adminRoutes.get('/users', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  const plan = c.req.query('plan')
  const level = c.req.query('level')
  const sort = c.req.query('sort')
  const page = intParam(c.req.query('page'), 0, 0, 100000)

  const filters: (SQL | undefined)[] = []
  if (q) {
    // The text is looked for in emails and names; a full user id also works.
    const ids = await searchUserIds(q)
    if (/^[0-9a-f-]{36}$/i.test(q)) ids.push(q)
    if (ids.length === 0) return c.json({ total: 0, page, pageSize: PAGE, users: [] })
    filters.push(inArray(users.id, ids))
  }
  if (plan === 'paying') filters.push(paying)
  else if (plan === 'pro' || plan === 'max') filters.push(and(eq(users.plan, plan), or(isNull(users.planUntil), gt(users.planUntil, sql`now()`))))
  else if (plan === 'free') filters.push(sql`not (${paying})`)
  if (level === 'none') filters.push(isNull(users.level))
  else if ((LEVELS as readonly string[]).includes(level ?? '')) filters.push(eq(users.level, level!))
  const where = and(...filters)

  const order =
    sort === 'active' ? sql`${users.lastActiveDate} desc nulls last` : sort === 'xp' ? desc(users.xp) : sort === 'streak' ? desc(users.currentStreak) : desc(users.createdAt)

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(where)
  const list = await db.select().from(users).where(where).orderBy(order).limit(PAGE).offset(page * PAGE)
  const ids = list.map((u) => u.id)
  const pii = await getPiiFor(ids)

  const lessons = ids.length ? await db.select({ id: lessonProgress.userId, n: sql<number>`count(*)::int` }).from(lessonProgress).where(inArray(lessonProgress.userId, ids)).groupBy(lessonProgress.userId) : []
  const voice = ids.length ? await db.select({ id: voiceSessions.userId, s: sql<number>`coalesce(sum(${voiceSessions.seconds}), 0)::int` }).from(voiceSessions).where(inArray(voiceSessions.userId, ids)).groupBy(voiceSessions.userId) : []
  const spent = ids.length ? await db.select({ id: payments.userId, rub: sql<number>`coalesce(sum(${payments.amountRub}), 0)::int` }).from(payments).where(and(inArray(payments.userId, ids), eq(payments.status, 'paid'))).groupBy(payments.userId) : []
  const lessonsBy = new Map(lessons.map((x) => [x.id, x.n]))
  const voiceBy = new Map(voice.map((x) => [x.id, x.s]))
  const spentBy = new Map(spent.map((x) => [x.id, x.rub]))

  return c.json({
    total,
    page,
    pageSize: PAGE,
    users: list.map((u) => ({
      id: u.id,
      email: pii.get(u.id)?.email ?? null,
      name: pii.get(u.id)?.displayName ?? null,
      telegram: pii.get(u.id)?.telegram ?? false,
      telegramId: pii.get(u.id)?.telegramId ?? null,
      telegramUsername: pii.get(u.id)?.telegramUsername ?? null,
      createdAt: u.createdAt,
      level: u.level,
      plan: planOf(u),
      planUntil: planOf(u) === 'free' ? null : u.planUntil,
      xp: u.xp,
      streak: u.currentStreak,
      lastActive: u.lastActiveDate,
      lessons: lessonsBy.get(u.id) ?? 0,
      voiceMinutes: Math.round((voiceBy.get(u.id) ?? 0) / 60),
      spentRub: spentBy.get(u.id) ?? 0,
    })),
  })
})

const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value)

/** Everything known about one student. */
adminRoutes.get('/users/:id', async (c) => {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!user) return c.json({ error: 'not_found' }, 404)
  const today = localDay(ZONE)

  const [pii, progress, usage, paid, calls, review, badges, placements, devices, push, views, source] = await Promise.all([
    getPiiFor([id]),
    db.select().from(lessonProgress).where(eq(lessonProgress.userId, id)).orderBy(desc(lessonProgress.lastCompletedAt)),
    db.select().from(dailyUsage).where(and(eq(dailyUsage.userId, id), gt(dailyUsage.day, dayBefore(lastDays(60)[0])))).orderBy(asc(dailyUsage.day)),
    db.select().from(payments).where(eq(payments.userId, id)).orderBy(desc(payments.createdAt)).limit(50),
    db
      .select({
        id: voiceSessions.id,
        teacher: voiceSessions.teacher,
        startedAt: voiceSessions.startedAt,
        seconds: voiceSessions.seconds,
        scenario: voiceSessions.scenario,
        lessonId: voiceSessions.lessonId,
        endReason: voiceSessions.endReason,
        reportStatus: voiceSessions.reportStatus,
        report: voiceSessions.report,
      })
      .from(voiceSessions)
      .where(eq(voiceSessions.userId, id))
      .orderBy(desc(voiceSessions.startedAt))
      .limit(30),
    db
      .select({ total: sql<number>`count(*)::int`, due: sql<number>`count(*) filter (where ${lte(reviewItems.dueDay, today)})::int` })
      .from(reviewItems)
      .where(eq(reviewItems.userId, id)),
    db.select().from(userAchievements).where(eq(userAchievements.userId, id)),
    db.select().from(placementResults).where(eq(placementResults.userId, id)).orderBy(desc(placementResults.createdAt)).limit(10),
    db.select({ n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${sessions.createdAt})` }).from(sessions).where(and(eq(sessions.userId, id), gt(sessions.expiresAt, sql`now()`))),
    db.select({ n: sql<number>`count(*)::int` }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, id)),
    db.select({ path: pageViews.path, at: pageViews.createdAt, device: pageViews.device }).from(pageViews).where(eq(pageViews.userId, id)).orderBy(desc(pageViews.createdAt)).limit(60),
    db
      .select({ referrer: pageViews.referrer, utmSource: pageViews.utmSource, utmMedium: pageViews.utmMedium, utmCampaign: pageViews.utmCampaign })
      .from(pageViews)
      .where(eq(pageViews.userId, id))
      .orderBy(asc(pageViews.createdAt))
      .limit(1),
  ])

  return c.json({
    profile: await getProfile(id),
    user: {
      id: user.id,
      email: pii.get(id)?.email ?? null,
      name: pii.get(id)?.displayName ?? null,
      telegram: pii.get(id)?.telegram ?? false,
      telegramId: pii.get(id)?.telegramId ?? null,
      telegramUsername: pii.get(id)?.telegramUsername ?? null,
      createdAt: user.createdAt,
      locale: user.locale,
      timezone: user.timezone,
      level: user.level,
      plan: planOf(user),
      storedPlan: user.plan,
      planUntil: user.planUntil,
      xp: user.xp,
      streak: user.currentStreak,
      longestStreak: user.longestStreak,
      freezes: user.streakFreezes,
      lastActive: user.lastActiveDate,
      reminders: user.remindersEnabled,
      reminderHour: user.reminderHour,
      consentAt: user.consentAt,
    },
    progress: progress.map((p) => ({ id: p.lessonId, accuracy: p.bestAccuracy, completions: p.completions, last: p.lastCompletedAt })),
    usage: usage.map((u) => ({ day: u.day, lessons: u.lessonsDone, xp: u.xp, voiceMinutes: Math.round(u.voiceSeconds / 60), messages: u.textMessages })),
    payments: paid,
    // The conversation itself is never stored; from the review only the numbers are shown here.
    calls: calls.map(({ report, ...call }) => ({ ...call, corrections: report?.corrections.length ?? null, words: report?.words.length ?? null })),
    review: review[0],
    achievements: badges.map((b) => b.key),
    placements: placements.map((p) => ({ method: p.method, level: p.level, at: p.createdAt })),
    devices: devices[0],
    pushDevices: push[0]?.n ?? 0,
    views,
    source: source[0] ?? null,
  })
})

/** Gives a student a paid plan for a number of days, or takes it away (plan "free"). */
adminRoutes.post('/users/:id/plan', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  if (!isUuid(id) || !['free', 'pro', 'max'].includes(body.plan)) return c.json({ error: 'invalid' }, 400)
  const days = Number.isInteger(body.days) ? Math.min(Math.max(body.days, 1), 3650) : 30
  const planUntil = body.plan === 'free' ? null : new Date(Date.now() + days * DAY_MS)
  const [updated] = await db.update(users).set({ plan: body.plan, planUntil }).where(eq(users.id, id)).returning({ id: users.id })
  if (!updated) return c.json({ error: 'not_found' }, 404)
  await log(c, body.plan === 'free' ? 'plan_removed' : 'plan_given', id, body.plan === 'free' ? undefined : { plan: body.plan, days })
  return c.json({ ok: true, plan: body.plan, planUntil })
})

/* ───────────────────────────── Photos ───────────────────────────── */

/** Profile photos for the owner to look at. `show=new` (the default) lists the ones not checked yet. */
adminRoutes.get('/photos', async (c) => {
  const page = intParam(c.req.query('page'), 0, 0, 100000)
  const size = 48
  const result = await listPhotos(c.req.query('show') !== 'all', size, page * size)
  return c.json({ ...result, page, pageSize: size, waiting: await countNewPhotos() })
})

/** What the owner decided about one photo: fine, or remove it (and, if asked, the text about the student too). */
adminRoutes.post('/photos/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  if (body.action === 'approve') {
    if (!(await approvePhoto(id))) return c.json({ error: 'not_found' }, 404)
  } else if (body.action === 'remove') {
    await deleteAvatar(id)
    await log(c, 'photo_removed', id)
  } else if (body.action === 'clear_bio') {
    await clearBio(id)
    await log(c, 'bio_removed', id)
  } else return c.json({ error: 'invalid' }, 400)
  return c.json({ ok: true })
})

/* ───────────────────────────── Feed ───────────────────────────── */

/** The Talkreal account's posts (waiting and published) and the latest comments. */
adminRoutes.get('/feed', async (c) => {
  const posts = await rows<Record<string, unknown>>(sql`
    select p.id, p.kind, p.body, p.status, p.publish_at as "publishAt", p.written_by as "writtenBy", p.image_id is not null as "hasImage",
           (select count(*)::int from feed_likes l where l.post_id = p.id) as likes,
           (select count(*)::int from feed_votes v where v.post_id = p.id) as votes,
           (select count(*)::int from feed_comments m where m.post_id = p.id and m.status = 'visible') as comments
    from feed_posts p order by p.publish_at desc limit 60
  `)
  const show = c.req.query('comments') === 'reported' ? sql`${feedComments.reports} > 0` : undefined
  const comments = await db.select().from(feedComments).where(show).orderBy(desc(feedComments.createdAt)).limit(80)
  const pii = await getPiiFor([...new Set(comments.map((m) => m.userId))])
  const [counts] = await rows<Record<string, number>>(sql`
    select (select count(*)::int from feed_comments) as comments,
           (select count(*)::int from feed_comments where reports > 0 and status = 'visible') as reported,
           (select count(*)::int from feed_comments where status = 'hidden') as hidden,
           (select count(distinct user_id)::int from feed_comments where created_at > now() - interval '7 days') as writers_7d,
           (select count(*)::int from feed_likes) as likes,
           (select count(*)::int from feed_votes) as votes
  `)
  return c.json({
    writer: writerName(),
    counts,
    posts,
    comments: comments.map((m) => ({ ...m, who: pii.get(m.userId)?.email ?? pii.get(m.userId)?.displayName ?? m.userId.slice(0, 8) })),
  })
})

/** Writes posts for any of the next seven days that has none. */
adminRoutes.post('/feed/fill', async (c) => {
  const result = await fillFeed()
  await log(c, 'feed_filled', null, result)
  return c.json(result)
})

/** Deletes the posts that have not gone out yet and writes them again. */
adminRoutes.post('/feed/rewrite', async (c) => {
  const result = await rewriteWaiting()
  await log(c, 'feed_rewritten', null, result)
  return c.json(result)
})

/** Hides, shows, publishes now, deletes or rewrites a post. */
adminRoutes.post('/feed/posts/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  if (!isUuid(id)) return c.json({ error: 'not_found' }, 404)
  const [post] = await db.select().from(feedPosts).where(eq(feedPosts.id, id)).limit(1)
  if (!post) return c.json({ error: 'not_found' }, 404)
  if (body.action === 'delete') await db.delete(feedPosts).where(eq(feedPosts.id, id))
  else if (body.action === 'hide' || body.action === 'show') await db.update(feedPosts).set({ status: body.action === 'hide' ? 'hidden' : 'active' }).where(eq(feedPosts.id, id))
  else if (body.action === 'publish_now') await db.update(feedPosts).set({ publishAt: new Date(), status: 'active' }).where(eq(feedPosts.id, id))
  else if (body.action === 'edit') {
    const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 600) : fallback)
    await db
      .update(feedPosts)
      .set({
        body: {
          ...post.body,
          title: { ru: text(body.titleRu, post.body.title.ru), en: text(body.titleEn, post.body.title.en) },
          text: { ru: text(body.textRu, post.body.text.ru), en: text(body.textEn, post.body.text.en) },
          english: typeof body.english === 'string' ? body.english.trim().slice(0, 200) || undefined : post.body.english,
        },
      })
      .where(eq(feedPosts.id, id))
  } else return c.json({ error: 'invalid' }, 400)
  await log(c, `post_${body.action}`, id)
  return c.json({ ok: true })
})

/** Hides a comment or brings it back. */
adminRoutes.post('/feed/comments/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  if (!isUuid(id) || (body.action !== 'hide' && body.action !== 'show')) return c.json({ error: 'invalid' }, 400)
  // Bringing a comment back also clears its reports: the owner has looked and found it fine.
  const set = body.action === 'hide' ? { status: 'hidden' } : { status: 'visible', reports: 0 }
  const updated = await db.update(feedComments).set(set).where(eq(feedComments.id, id)).returning({ id: feedComments.id })
  if (updated.length === 0) return c.json({ error: 'not_found' }, 404)
  await log(c, `comment_${body.action}`, id)
  return c.json({ ok: true })
})

/* ───────────────────────────── Payments ───────────────────────────── */

adminRoutes.get('/payments', async (c) => {
  const page = intParam(c.req.query('page'), 0, 0, 100000)
  const status = c.req.query('status')
  const where = status === 'paid' || status === 'pending' || status === 'canceled' ? eq(payments.status, status) : undefined
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(payments).where(where)
  const list = await db.select().from(payments).where(where).orderBy(desc(payments.createdAt)).limit(PAGE).offset(page * PAGE)
  const pii = await getPiiFor([...new Set(list.map((p) => p.userId))])
  const byPlan = await rows<{ plan: string; period: string; n: number; rub: number }>(sql`
    select plan, period, count(*)::int as n, coalesce(sum(amount_rub), 0)::int as rub from payments where status = 'paid' group by 1, 2 order by 4 desc
  `)
  const [totals] = await rows<Record<string, number>>(sql`
    select count(*) filter (where status = 'paid')::int as paid, count(*) filter (where status = 'pending')::int as pending,
           count(*) filter (where status = 'canceled')::int as canceled,
           coalesce(sum(amount_rub) filter (where status = 'paid'), 0)::int as revenue,
           coalesce(sum(list_rub - amount_rub) filter (where status = 'paid' and list_rub is not null), 0)::int as discounts
    from payments
  `)
  return c.json({
    total,
    page,
    pageSize: PAGE,
    totals,
    byPlan,
    prices: PRICES,
    payments: list.map((p) => ({ ...p, email: pii.get(p.userId)?.email ?? pii.get(p.userId)?.displayName ?? null })),
  })
})

/* ───────────────────────────── Promo codes ───────────────────────────── */

adminRoutes.get('/promos', async (c) => {
  const list = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt))
  const earned = await rows<{ code: string; n: number; rub: number; discount: number }>(sql`
    select promo_code as code, count(*)::int as n, coalesce(sum(amount_rub), 0)::int as rub, coalesce(sum(list_rub - amount_rub), 0)::int as discount
    from payments where status = 'paid' and promo_code is not null group by 1
  `)
  const by = new Map(earned.map((e) => [e.code, e]))
  return c.json({ promos: list.map((p) => ({ ...p, paidUses: by.get(p.code)?.n ?? 0, revenueRub: by.get(p.code)?.rub ?? 0, discountRub: by.get(p.code)?.discount ?? 0 })) })
})

adminRoutes.post('/promos', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const code = normalizeCode(body.code)
  const percentOff = Number(body.percentOff)
  if (!isValidCode(code)) return c.json({ error: 'bad_code' }, 400)
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100) return c.json({ error: 'bad_percent' }, 400)
  const maxUses = Number.isInteger(body.maxUses) && body.maxUses > 0 ? body.maxUses : null
  const validUntil = typeof body.validUntil === 'string' && !Number.isNaN(Date.parse(body.validUntil)) ? new Date(body.validUntil) : null
  const [created] = await db
    .insert(promoCodes)
    .values({
      code,
      percentOff,
      plan: body.plan === 'pro' || body.plan === 'max' ? body.plan : null,
      period: body.period === 'month' || body.period === 'year' ? body.period : null,
      maxUses,
      validUntil,
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null,
    })
    .onConflictDoNothing()
    .returning()
  if (!created) return c.json({ error: 'exists' }, 409)
  await log(c, 'promo_created', code, { percentOff, maxUses })
  return c.json({ promo: created })
})

/** Switches a code off or back on. Codes are never deleted, so past payments keep their meaning. */
adminRoutes.post('/promos/:code', async (c) => {
  const code = normalizeCode(c.req.param('code'))
  const body = await c.req.json().catch(() => ({}))
  if (typeof body.active !== 'boolean') return c.json({ error: 'invalid' }, 400)
  const [updated] = await db.update(promoCodes).set({ active: body.active }).where(eq(promoCodes.code, code)).returning()
  if (!updated) return c.json({ error: 'not_found' }, 404)
  await log(c, body.active ? 'promo_enabled' : 'promo_disabled', code)
  return c.json({ promo: updated })
})

/* ───────────────────────────── Learning ───────────────────────────── */

adminRoutes.get('/learning', async (c) => {
  const done = await rows<{ id: string; users: number; accuracy: number; completions: number }>(sql`
    select lesson_id as id, count(*)::int as users, round(avg(best_accuracy))::int as accuracy, coalesce(sum(completions), 0)::int as completions
    from lesson_progress group by 1
  `)
  const by = new Map(done.map((d) => [d.id, d]))
  const stat = (id: string) => ({ users: by.get(id)?.users ?? 0, accuracy: by.get(id)?.accuracy ?? null, completions: by.get(id)?.completions ?? 0 })
  const levels = await rows<{ level: string; n: number }>(sql`select coalesce(level, 'none') as level, count(*)::int as n from users group by 1`)
  const placement = await rows<{ method: string; level: string; n: number }>(sql`select method, level, count(*)::int as n from placement_results group by 1, 2`)
  const [review] = await rows<Record<string, number>>(sql`
    select count(*)::int as items, count(distinct user_id)::int as students, count(*) filter (where due_day <= ${localDay(ZONE)}::date)::int as due,
           count(*) filter (where box >= 5)::int as well_known, coalesce(sum(lapses), 0)::int as lapses
    from review_items
  `)
  const badges = await rows<{ key: string; n: number }>(sql`select key, count(*)::int as n from user_achievements group by 1`)
  const badgeBy = new Map(badges.map((b) => [b.key, b.n]))

  return c.json({
    levels,
    placement,
    review,
    goals: await goalCounts(),
    achievements: ACHIEVEMENTS.map((a) => ({ key: a.key, icon: a.icon, students: badgeBy.get(a.key) ?? 0 })),
    course: LEVELS.map((level) => ({
      level,
      lessons: lessonsFor(level).length,
      exam: stat(examId(level)),
      units: unitsFor(level).map((unit) => ({
        number: unit.number,
        title: unit.title.en,
        test: stat(unit.testId),
        lessons: unit.lessons.map((lesson) => ({ id: lesson.id, order: lesson.order, title: lesson.title.en, ...stat(lesson.id) })),
      })),
    })),
  })
})

/* ───────────────────────────── AI teachers ───────────────────────────── */

adminRoutes.get('/ai', async (c) => {
  const days = intParam(c.req.query('days'), 30, 7, 365)
  const since = sql`started_at > now() - ${interval(days)}`
  const byTeacher = await rows<{ teacher: string; calls: number; seconds: number }>(sql`
    select teacher, count(*)::int as calls, coalesce(sum(seconds), 0)::int as seconds from voice_sessions where ${since} group by 1 order by 3 desc
  `)
  const byTopic = await rows<{ topic: string; calls: number; seconds: number }>(sql`
    select case when lesson_id is not null then 'lesson' when scenario is not null then scenario else 'free talk' end as topic,
           count(*)::int as calls, coalesce(sum(seconds), 0)::int as seconds
    from voice_sessions where ${since} group by 1 order by 2 desc
  `)
  const endings = await rows<{ reason: string; calls: number }>(sql`
    select coalesce(end_reason, 'unfinished') as reason, count(*)::int as calls from voice_sessions where ${since} group by 1 order by 2 desc
  `)
  const reports = await rows<{ status: string; calls: number }>(sql`
    select report_status as status, count(*)::int as calls from voice_sessions where ${since} group by 1 order by 2 desc
  `)
  const [totals] = await rows<Record<string, number>>(sql`
    select count(*)::int as calls, count(distinct user_id)::int as students, coalesce(sum(seconds), 0)::int as seconds,
           coalesce(round(avg(seconds) filter (where seconds > 0)), 0)::int as avg_seconds,
           coalesce(sum(seconds) filter (where usage is not null), 0)::int as metered_seconds,
           coalesce(sum((usage->>'prompt')::bigint), 0)::bigint as prompt_tokens,
           coalesce(sum((usage->>'response')::bigint), 0)::bigint as response_tokens
    from voice_sessions where ${since}
  `)
  const [chat] = await rows<{ messages: number; students: number }>(sql`
    select coalesce(sum(text_messages), 0)::int as messages, count(*) filter (where text_messages > 0)::int as students
    from daily_usage where day > ${localDay(ZONE)}::date - ${sql.raw(String(days))}
  `)
  const recent = await rows<Record<string, unknown>>(sql`
    select id, user_id as "userId", teacher, started_at as "startedAt", seconds, scenario, lesson_id as "lessonId", end_reason as "endReason",
           report_status as "reportStatus", (usage->>'total')::bigint as tokens,
           case when report is not null then jsonb_array_length(report->'corrections') end as corrections
    from voice_sessions order by started_at desc limit 40
  `)
  const pii = await getPiiFor([...new Set(recent.map((r) => String(r.userId)))])
  return c.json({
    days,
    totals: { ...totals, prompt_tokens: Number(totals.prompt_tokens), response_tokens: Number(totals.response_tokens) },
    chat,
    byTeacher,
    byTopic,
    endings,
    reports,
    recent: recent.map((r) => ({ ...r, tokens: r.tokens === null ? null : Number(r.tokens), email: pii.get(String(r.userId))?.email ?? pii.get(String(r.userId))?.displayName ?? null })),
    status: { voice: voiceProvider()?.name ?? null, text: textAiAvailable(), liveModel: env.ai.liveModel, textModel: env.ai.textModel },
  })
})

/* ───────────────────────────── Traffic ───────────────────────────── */

adminRoutes.get('/traffic', async (c) => {
  const days = intParam(c.req.query('days'), 30, 7, 365)
  const range = lastDays(days)
  const since = sql`created_at > now() - ${interval(days)}`

  const daily = await rows<{ d: string; views: number; visitors: number }>(sql`
    select to_char((created_at at time zone ${ZONE})::date, 'YYYY-MM-DD') as d, count(*)::int as views, count(distinct visitor_id)::int as visitors
    from page_views where (created_at at time zone ${ZONE})::date >= ${range[0]}::date group by 1
  `)
  const by = new Map(daily.map((row) => [row.d, row]))
  // Screens with an id in the address (a lesson, a teacher) are counted together.
  const pages = await rows<{ path: string; views: number; visitors: number }>(sql`
    select regexp_replace(path, '^/(lesson|test|talk|chat)/.+$', '/\\1/…') as path, count(*)::int as views, count(distinct visitor_id)::int as visitors
    from page_views where ${since} group by 1 order by 2 desc limit 25
  `)
  // Where each visitor first came from, and what became of them.
  const sources = await rows<{ source: string; campaign: string | null; visitors: number; accounts: number; buyers: number; rub: number }>(sql`
    with v as (
      select visitor_id,
             (array_agg(coalesce(nullif(utm_source, ''), referrer, 'direct') order by created_at))[1] as source,
             (array_agg(utm_campaign order by created_at))[1] as campaign,
             (array_agg(user_id) filter (where user_id is not null))[1] as user_id
      from page_views where ${since} group by visitor_id
    ), paid as (
      select user_id, sum(amount_rub)::int as rub from payments where status = 'paid' group by 1
    )
    select v.source, v.campaign, count(*)::int as visitors, count(v.user_id)::int as accounts,
           count(paid.user_id)::int as buyers, coalesce(sum(paid.rub), 0)::int as rub
    from v left join paid on paid.user_id = v.user_id
    group by 1, 2 order by 3 desc limit 40
  `)
  const devices = await rows<{ device: string; visitors: number }>(sql`
    select coalesce(device, 'unknown') as device, count(distinct visitor_id)::int as visitors from page_views where ${since} group by 1 order by 2 desc
  `)
  const [totals] = await rows<Record<string, number>>(sql`
    select count(*)::int as views, count(distinct visitor_id)::int as visitors, count(distinct user_id)::int as accounts,
           count(distinct visitor_id) filter (where user_id is null)::int as anonymous
    from page_views where ${since}
  `)
  return c.json({
    days,
    totals,
    series: range.map((day) => ({ day, views: by.get(day)?.views ?? 0, visitors: by.get(day)?.visitors ?? 0 })),
    pages,
    sources,
    devices,
  })
})

/* ───────────────────────────── System ───────────────────────────── */

adminRoutes.get('/system', async (c) => {
  const actions = await db.select().from(adminActions).orderBy(desc(adminActions.createdAt)).limit(60)
  const pii = await getPiiFor([...new Set(actions.map((a) => a.adminId))])
  const [counts] = await rows<Record<string, number>>(sql`
    select (select count(*)::int from sessions where expires_at > now()) as sessions,
           (select count(*)::int from push_subscriptions) as push_devices,
           (select count(*)::int from users where reminders_enabled) as reminders_on,
           (select count(*)::int from page_views) as page_views,
           (select count(*)::int from review_items) as review_items
  `)
  return c.json({
    status: {
      database: dbStatus.kind,
      databaseError: dbStatus.error ? 'yes' : null,
      payments: billingMode(),
      receipts: env.billing.receipts,
      voice: voiceProvider()?.name ?? 'off',
      textAi: textAiAvailable(),
      email: emailConfigured,
      telegram: telegramAvailable(),
      testMode: env.showCodes,
      admins: env.adminEmails.length,
      lessons: LEVELS.reduce((sum, level) => sum + lessonsFor(level).length, 0),
      uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
      node: process.version,
    },
    counts,
    actions: actions.map((a) => ({ ...a, admin: pii.get(a.adminId)?.email ?? a.adminId })),
  })
})
