import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core'
import type { PostBody } from '../../shared/feed'
import type { CallReport } from '../../shared/report'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true })

/** A learner. Contains NO personal data: that lives in user_pii. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  locale: text('locale').notNull().default('ru'),
  /** CEFR level A1–C1; empty until the placement step. */
  level: text('level'),
  timezone: text('timezone'),
  plan: text('plan').notNull().default('free'),
  /** When the paid plan runs out. Empty = the free plan, or a paid plan given by hand with no end. */
  planUntil: timestamptz('plan_until'),
  xp: integer('xp').notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastActiveDate: date('last_active_date'),
  /** Streak freezes in stock: each one saves the streak across one missed day. */
  streakFreezes: integer('streak_freezes').notNull().default(1),
  /** Daily "time to practise" reminders. */
  remindersEnabled: boolean('reminders_enabled').notNull().default(true),
  /** Hour of the student's own day (0–23) when the reminder goes out. */
  reminderHour: integer('reminder_hour').notNull().default(19),
  /** The last local day a reminder was sent, so nobody gets two in one day. */
  lastReminderDay: date('last_reminder_day'),
  /** Notifications about followers, messages, comments and prizes. */
  notifySocial: boolean('notify_social').notNull().default(true),
  /** A morning notification with the post of the day or the weekly challenge. */
  notifyFeed: boolean('notify_feed').notNull().default(true),
  /** The last local day the post of the day was sent. */
  lastFeedPushDay: date('last_feed_push_day'),
  /** When the student agreed to the privacy policy. */
  consentAt: timestamptz('consent_at'),
  /** When the student filled in (or skipped) the "about you" step. Empty = show it once. */
  profileSetAt: timestamptz('profile_set_at'),
  /** When the student read and accepted the rules for private messages (and said they are an adult). */
  dmRulesAt: timestamptz('dm_rules_at'),
  /** Set by the owner: this student may not write private messages. */
  dmBannedAt: timestamptz('dm_banned_at'),
  /** Set by the owner: a real, verified teacher. Shown with a checkmark; may write polls; their posts are open to everyone. */
  teacherAt: timestamptz('teacher_at'),
  /** Set by the owner: this student may not write posts or comments in the feed. */
  feedBannedAt: timestamptz('feed_banned_at'),
})

/** Badges a student has earned. The list of possible badges lives in src/shared/achievements.ts. */
export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    earnedAt: timestamptz('earned_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
)

/** A phone or browser that agreed to receive notifications. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
)

/** Values the server generates once and must keep, such as the notification signing keys. */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

/**
 * Personal data (152-FZ). Kept in its own table so it can be moved to separate storage.
 * Only code in src/server/pii/ may read or write this table.
 */
export const userPii = pgTable('user_pii', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').unique(),
  telegramId: text('telegram_id').unique(),
  /** The @name in Telegram, without the @. People can change it, so it is refreshed at every login. */
  telegramUsername: text('telegram_username'),
  displayName: text('display_name'),
  /** What the student chose to tell about themselves (see src/shared/profile.ts). All optional. */
  bio: text('bio'),
  city: text('city'),
  birthYear: integer('birth_year'),
  gender: text('gender'),
  goals: jsonb('goals').$type<string[]>(),
  interests: jsonb('interests').$type<string[]>(),
  /** May other students see this profile? On for new accounts; a student who wants a private page switches it off. */
  discoverable: boolean('discoverable').notNull().default(true),
  /** Set by the owner: the profile is hidden from other students and the student cannot open it again. */
  hiddenByAdminAt: timestamptz('hidden_by_admin_at'),
})

/**
 * Profile photos. Personal data, so only code in src/server/pii/ may touch this table.
 * A photo is shrunk on the phone to a small square before it is sent, so it fits in the database.
 */
export const userAvatars = pgTable('user_avatars', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  /** The picture itself, base64. */
  data: text('data').notNull(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  /** When the owner looked at this photo in the admin panel and approved it. A new photo clears it. */
  reviewedAt: timestamptz('reviewed_at'),
})

/** One-time login codes. Only a hash of the code is stored. */
export const authCodes = pgTable(
  'auth_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
    consumedAt: timestamptz('consumed_at'),
  },
  (t) => [index('auth_codes_email_idx').on(t.email, t.createdAt)],
)

/** How a student's level was set: by the test (with their answers) or chosen by themselves. */
export const placementResults = pgTable(
  'placement_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    method: text('method').notNull(), // 'test' | 'self'
    level: text('level').notNull(),
    answers: jsonb('answers'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('placement_results_user_idx').on(t.userId)],
)

/** One row per lesson a student has completed at least once. */
export const lessonProgress = pgTable(
  'lesson_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull(),
    completions: integer('completions').notNull().default(1),
    /** Best result so far, 0–100. */
    bestAccuracy: integer('best_accuracy').notNull(),
    firstCompletedAt: timestamptz('first_completed_at').notNull().defaultNow(),
    lastCompletedAt: timestamptz('last_completed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
)

/** What a student did on one calendar day (in their own timezone). Drives limits and the daily goal. */
export const dailyUsage = pgTable(
  'daily_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    lessonsDone: integer('lessons_done').notNull().default(0),
    xp: integer('xp').notNull().default(0),
    voiceSeconds: integer('voice_seconds').notNull().default(0),
    textMessages: integer('text_messages').notNull().default(0),
    /** Review sessions finished, and lessons finished with a high result: counted for the daily quests. */
    reviewsDone: integer('reviews_done').notNull().default(0),
    goodLessons: integer('good_lessons').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)

/** Every AI voice call, for cost auditing. */
export const voiceSessions = pgTable(
  'voice_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teacher: text('teacher').notNull(),
    provider: text('provider').notNull(),
    startedAt: timestamptz('started_at').notNull().defaultNow(),
    endedAt: timestamptz('ended_at'),
    seconds: integer('seconds').notNull().default(0),
    endReason: text('end_reason'),
    /** The role-play that was chosen, if any, and the lesson the call practised, if any. */
    scenario: text('scenario'),
    lessonId: text('lesson_id'),
    /** The teacher's written review of the call (see src/shared/report.ts). The conversation itself is not kept. */
    report: jsonb('report').$type<CallReport>(),
    /** What the AI company counted for this call (tokens), to know what a minute really costs. */
    usage: jsonb('usage').$type<Record<string, number>>(),
    /** 'none' | 'pending' | 'ready' | 'failed' */
    reportStatus: text('report_status').notNull().default('none'),
  },
  (t) => [index('voice_sessions_user_idx').on(t.userId, t.startedAt)],
)

/** Login sessions. Only a hash of the cookie token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

/**
 * Things a student should see again: an exercise they got wrong, or a word from a finished lesson.
 * Each right answer moves the item to a higher box, and it comes back after a longer gap.
 */
export const reviewItems = pgTable(
  'review_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** "e:<lesson>:<exercise fingerprint>", "w:<lesson>:<english word>" or "c:<fingerprint>" (a word from a call). */
    key: text('key').notNull(),
    lessonId: text('lesson_id').notNull(),
    box: integer('box').notNull().default(0),
    /** The student's local day from which the item is shown again. */
    dueDay: date('due_day').notNull(),
    /** How many times it was answered wrong in review. */
    lapses: integer('lapses').notNull().default(0),
    /** For a word that does not come from a lesson (key "c:…", from a call review): the word itself. */
    data: jsonb('data').$type<{ en: string; ru: string; example?: string }>(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] }), index('review_items_due_idx').on(t.userId, t.dueDay)],
)

/** Every purchase of a plan. A row is created when the student presses "pay" and updated when the money arrives. */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'yookassa' | 'mock' */
    provider: text('provider').notNull(),
    /** The payment's id at the payment service. */
    providerPaymentId: text('provider_payment_id').unique(),
    plan: text('plan').notNull(),
    /** 'month' | 'year' */
    period: text('period').notNull(),
    /** What was actually charged, after any promo code. */
    amountRub: integer('amount_rub').notNull(),
    /** The promo code used, and the price before it was applied. */
    promoCode: text('promo_code'),
    listRub: integer('list_rub'),
    /** 'pending' | 'paid' | 'canceled' */
    status: text('status').notNull().default('pending'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    paidAt: timestamptz('paid_at'),
  },
  (t) => [index('payments_user_idx').on(t.userId, t.createdAt)],
)

/** Discount codes for paid plans, created in the admin panel. */
export const promoCodes = pgTable('promo_codes', {
  /** Always upper case, e.g. "ANNA20". */
  code: text('code').primaryKey(),
  /** 1–100. A code of 100 gives the plan for free. */
  percentOff: integer('percent_off').notNull(),
  /** Limits the code to one plan ('pro' | 'max') or one term ('month' | 'year'). Empty = any. */
  plan: text('plan'),
  period: text('period'),
  /** How many payments may use the code in total. Empty = no limit. */
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  validUntil: timestamptz('valid_until'),
  active: boolean('active').notNull().default(true),
  /** For the owner only: whose code it is, which campaign. */
  note: text('note'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
})

/**
 * One row per screen opened, for the statistics in the admin panel. No IP address is stored.
 * The visitor id is a random number kept in the browser, so visits before and after login can be joined.
 */
export const pageViews = pgTable(
  'page_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitorId: text('visitor_id').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    path: text('path').notNull(),
    /** Where the visitor first came from: the other site's address, and the campaign tags of the link. */
    referrer: text('referrer'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    /** 'mobile' | 'desktop' */
    device: text('device'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('page_views_time_idx').on(t.createdAt), index('page_views_visitor_idx').on(t.visitorId), index('page_views_user_idx').on(t.userId)],
)

/** What was done in the admin panel, by whom and when. */
export const adminActions = pgTable(
  'admin_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    details: jsonb('details'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('admin_actions_time_idx').on(t.createdAt)],
)

/** The three quests a student was given for one day, and which of them they have collected. */
export const dailyQuests = pgTable(
  'daily_quests',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    /** Quest ids, see src/shared/play.ts. */
    quests: jsonb('quests').$type<string[]>().notNull(),
    claimed: jsonb('claimed').$type<string[]>().notNull(),
    /** XP given for quests that day, so it is not counted towards the "earn XP" quest itself. */
    bonusXp: integer('bonus_xp').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
)

/** Which league and group a student is in for one week (the week is named by its Monday). */
export const leagueMembers = pgTable(
  'league_members',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    week: date('week').notNull(),
    /** 0 = the first league; see LEAGUE_TIERS in src/shared/play.ts. */
    tier: integer('tier').notNull(),
    groupNo: integer('group_no').notNull(),
    joinedAt: timestamptz('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.week] }), index('league_group_idx').on(t.week, t.tier, t.groupNo)],
)

/** Pictures for feed posts, kept apart from the posts so the feed loads fast. */
export const feedImages = pgTable('feed_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  mime: text('mime').notNull(),
  /** The picture, base64. */
  data: text('data').notNull(),
})

/** Posts of the Talkreal account. A post is visible once its time has come, unless it is hidden. */
export const feedPosts = pgTable(
  'feed_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** See POST_KINDS in src/shared/feed.ts. */
    kind: text('kind').notNull(),
    body: jsonb('body').$type<PostBody>().notNull(),
    imageId: uuid('image_id').references(() => feedImages.id, { onDelete: 'set null' }),
    /** The student who wrote it. Null for the Talkreal account's posts. */
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'cascade' }),
    /** How many students reported it (students' posts only). */
    reports: integer('reports').notNull().default(0),
    /** For a student's answer to a weekly challenge: the challenge post. */
    challengeId: uuid('challenge_id').references((): AnyPgColumn => feedPosts.id, { onDelete: 'cascade' }),
    /** For a challenge post: when answers stop being accepted, and when the winners were chosen. */
    endsAt: timestamptz('ends_at'),
    settledAt: timestamptz('settled_at'),
    /** For an answer that won: the XP it earned. */
    prize: integer('prize'),
    /** 'active' | 'hidden' */
    status: text('status').notNull().default('active'),
    publishAt: timestamptz('publish_at').notNull(),
    /** 'gemini' | 'mock' | 'owner' | 'student' */
    writtenBy: text('written_by').notNull().default('owner'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('feed_posts_time_idx').on(t.publishAt), index('feed_posts_challenge_idx').on(t.challengeId)],
)

export const feedLikes = pgTable(
  'feed_likes',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
)

/** Answers to quiz posts: one per student. */
export const feedVotes = pgTable(
  'feed_votes',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    choice: integer('choice').notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
)

export const feedComments = pgTable(
  'feed_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** 'visible' | 'hidden' */
    status: text('status').notNull().default('visible'),
    /** How many students reported it. */
    reports: integer('reports').notNull().default(0),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('feed_comments_post_idx').on(t.postId, t.createdAt), index('feed_comments_user_idx').on(t.userId, t.createdAt)],
)

/** Who reported which student post, so one student counts once. */
export const feedPostReports = pgTable(
  'feed_post_reports',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
)

/** Who reported which comment, so one student counts once. */
export const feedReports = pgTable(
  'feed_reports',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => feedComments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
)

/* ───────────── The community: following, blocking and private messages ───────────── */

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index('follows_followee_idx').on(t.followeeId)],
)

/** A student who does not want to hear from another one. */
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index('user_blocks_blocked_idx').on(t.blockedId)],
)

/**
 * A private conversation between two students. `userA` is always the smaller id of the two,
 * so a pair has exactly one conversation.
 */
export const dmThreads = pgTable(
  'dm_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userA: uuid('user_a')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userB: uuid('user_b')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedBy: uuid('started_by').notNull(),
    /** 'request' until the other student answers or accepts, then 'open'; 'declined' if they said no. */
    status: text('status').notNull().default('request'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    lastMessageAt: timestamptz('last_message_at').notNull().defaultNow(),
    /** Up to when each of the two has read. */
    readAtA: timestamptz('read_at_a'),
    readAtB: timestamptz('read_at_b'),
  },
  (t) => [uniqueIndex('dm_threads_pair_idx').on(t.userA, t.userB), index('dm_threads_b_idx').on(t.userB)],
)

export const dmMessages = pgTable(
  'dm_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => dmThreads.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** The same message in better English, shown to the sender only. */
    better: text('better'),
    /** 'sent' | 'hidden' (removed by a moderator) | 'rejected' (stopped by the check, never delivered) */
    status: text('status').notNull().default('sent'),
    /** The earlier message of the same conversation this one answers, if the sender picked one. */
    replyToId: uuid('reply_to_id'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('dm_messages_thread_idx').on(t.threadId, t.createdAt), index('dm_messages_sender_idx').on(t.senderId, t.createdAt)],
)

/** An emoji one of the two left on a message. One per person per message; see REACTIONS in src/shared/social.ts. */
export const dmReactions = pgTable(
  'dm_reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => dmMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
)

/** A student's complaint about a conversation or about another student. */
export const socialReports = pgTable(
  'social_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    aboutId: uuid('about_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').references(() => dmThreads.id, { onDelete: 'cascade' }),
    /** See REPORT_REASONS in src/shared/social.ts. */
    reason: text('reason').notNull(),
    note: text('note'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    resolvedAt: timestamptz('resolved_at'),
  },
  (t) => [index('social_reports_open_idx').on(t.resolvedAt, t.createdAt)],
)
