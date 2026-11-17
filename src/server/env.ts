import { randomBytes } from 'node:crypto'

const isProduction = process.env.NODE_ENV === 'production'

function authSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET
  if (!isProduction) return 'dev-only-secret'
  // Without a configured secret, login codes stop working after each restart. Safe, but set AUTH_SECRET.
  console.warn('AUTH_SECRET is not set: using a temporary one for this run.')
  return randomBytes(32).toString('hex')
}

/** All server settings come from environment variables; nothing secret lives in the code. */
export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 8787),

  /** PostgreSQL connection string. When empty, an embedded database in ./.data is used instead. */
  databaseUrl: process.env.DATABASE_URL ?? '',

  authSecret: authSecret(),

  /**
   * Shows the login code on screen instead of relying on email.
   * On by default in local development; in production only if DEV_SHOW_CODES=1.
   */
  showCodes: process.env.DEV_SHOW_CODES ? process.env.DEV_SHOW_CODES === '1' : !isProduction,

  telegram: {
    /** From @BotFather. Empty = Telegram login is switched off. */
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    apiBase: process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org',
  },

  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
}
