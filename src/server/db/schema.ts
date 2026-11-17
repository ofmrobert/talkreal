import { date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
  xp: integer('xp').notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastActiveDate: date('last_active_date'),
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
