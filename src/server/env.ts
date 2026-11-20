const isProduction = process.env.NODE_ENV === 'production'

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

  /** The public address of the app, used in reminder links. */
  appUrl: (process.env.APP_URL ?? 'https://talk-real.ru').replace(/\/+$/, ''),

  /**
   * Shows the login code on screen instead of relying on email.
   * On by default in local development; in production only if DEV_SHOW_CODES=1.
   */
  showCodes: process.env.DEV_SHOW_CODES ? process.env.DEV_SHOW_CODES === '1' : !isProduction,

  ai: {
    /** Google AI Studio key. Empty = voice conversations are switched off. */
    geminiKey: process.env.GEMINI_API_KEY ?? '',
    liveModel: process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.8-live',
    /** The model for written work: call reviews, text chat, checking typed answers. */
    textModel: process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.8-flash',
    /** Where the AI is reached. Point this at a relay outside Russia if Google refuses a direct connection. */
    geminiWsBase: process.env.GEMINI_WS_BASE ?? 'wss://generativelanguage.googleapis.com',
    /** "mock" replaces the real AI with a stand-in, for testing without a key. */
    voiceProvider: process.env.VOICE_PROVIDER ?? 'gemini',
  },

  /**
   * Emails of the people who may open the admin panel (/admin), separated by commas.
   * Empty = nobody can. They log in the normal way, with a code sent to that email.
   */
  // Forgiving about how it was typed: quotes, spaces, semicolons or new lines between emails are all fine.
  adminEmails: (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? '')
    .split(/[\s,;]+/)
    .map((email) => email.replace(/^['"<]+|['">]+$/g, '').trim().toLowerCase())
    .filter((email) => email.includes('@')),

  billing: {
    /** From the ЮKassa dashboard. Both empty = payments are switched off and plans cannot be bought. */
    shopId: process.env.YOOKASSA_SHOP_ID ?? '',
    secretKey: process.env.YOOKASSA_SECRET_KEY ?? '',
    /** "mock" replaces ЮKassa with a stand-in that pays at once, for testing without money. */
    provider: process.env.BILLING_PROVIDER ?? 'yookassa',
    /** Send a receipt with every payment (needed by companies and sole traders, not by the self-employed). */
    receipts: process.env.YOOKASSA_RECEIPTS === '1',
    /** The VAT code for receipts; 1 = "without VAT" (simplified tax system). */
    vatCode: Number(process.env.YOOKASSA_VAT_CODE ?? 1),
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
