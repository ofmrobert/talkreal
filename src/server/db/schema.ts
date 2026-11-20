import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
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
  /** When the student agreed to the privacy policy. */
  consentAt: timestamptz('consent_at'),
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
  displayName: text('display_name'),
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
