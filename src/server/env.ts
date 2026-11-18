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
  // Forgiving about what gets pasted: takes the address out of `psql '...'`, quotes or stray spaces.
  databaseUrl: (process.env.DATABASE_URL ?? '').match(/postgres(?:ql)?:\/\/[^\s'"]+/)?.[0] ?? (process.env.DATABASE_URL ?? '').trim(),
  /** What the pasted value looks like, without revealing it. Helps explain a wrong value. */
  databaseUrlShape: ((raw: string) => ({
    length: raw.length,
    startsWithScheme: /^postgres(ql)?:\/\//.test(raw),
    hasSpace: /\s/.test(raw),
    hasQuote: /['"]/.test(raw),
    atSigns: (raw.match(/@/g) ?? []).length,
    hasPercent: raw.includes('%'),
    hasHash: raw.includes('#'),
  }))(process.env.DATABASE_URL ?? ''),
  databaseSsl: process.env.DATABASE_SSL ?? '',

  authSecret: authSecret(),

  /**
   * Shows the login code on screen instead of relying on email.
   * On by default in local development; in production only if DEV_SHOW_CODES=1.
   */
  showCodes: process.env.DEV_SHOW_CODES ? process.env.DEV_SHOW_CODES === '1' : !isProduction,

  ai: {
    /** Google AI Studio key. Empty = voice conversations are switched off. */
    geminiKey: process.env.GEMINI_API_KEY ?? '',
    liveModel: process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.8-live',
    /** Where the AI is reached. Point this at a relay outside Russia if Google refuses a direct connection. */
    geminiWsBase: process.env.GEMINI_WS_BASE ?? 'wss://generativelanguage.googleapis.com',
    /** "mock" replaces the real AI with a stand-in, for testing without a key. */
    voiceProvider: process.env.VOICE_PROVIDER ?? 'gemini',
  },

  telegram: {
    /** From @BotFather. Empty = Telegram login is switched off. */
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    apiBase: process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org',
  },

  email: {
    /** The sender shown on login emails, e.g. "Talkreal <login@talk-real.ru>". */
    from: process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? '',
    /** Key for the email service (Resend). Empty = try SMTP instead. */
    resendKey: process.env.RESEND_API_KEY ?? '',
    resendBase: process.env.RESEND_API_BASE ?? 'https://api.resend.com',
  },

  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
}
