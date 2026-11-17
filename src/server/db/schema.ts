import { date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
