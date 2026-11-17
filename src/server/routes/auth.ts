import { Hono } from 'hono'
import { issueCode, verifyCode } from '../auth/codes'
import { sendLoginCode } from '../auth/email'
import { endSession, startSession } from '../auth/sessions'
import { env } from '../env'
import { createLogin, pollLogin, telegramAvailable } from '../auth/telegram'
import {
  createUserWithEmail,
  createUserWithTelegram,
  findUserIdByEmail,
  findUserIdByTelegramId,
  normalizeEmail,
} from '../pii'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function readEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = normalizeEmail(value)
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null
}

const readLang = (value: unknown) => (value === 'en' ? 'en' : 'ru')

export const authRoutes = new Hono()

/** Step 1: the student enters an email and receives a 6-digit code. */
authRoutes.post('/request-code', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const email = readEmail(body.email)
  if (!email) return c.json({ error: 'invalid_email' }, 400)

  const issued = await issueCode(email)
  if (!issued.ok) return c.json({ error: issued.error, retryAfter: issued.retryAfter }, 429)

  try {
    await sendLoginCode(email, issued.code, readLang(body.lang))
  } catch (err) {
    console.error('Failed to send login email:', err)
    return c.json({ error: 'email_failed' }, 502)
  }
  // devCode is only present in test mode (see env.showCodes); the app then shows it on screen.
  return c.json({ ok: true, ...(env.showCodes ? { devCode: issued.code } : {}) })
})

/** Step 2: the student enters the code. New emails get an account automatically. */
authRoutes.post('/verify', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const email = readEmail(body.email)
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!email || !/^\d{6}$/.test(code)) return c.json({ error: 'wrong' }, 400)

  const result = await verifyCode(email, code)
  if (result !== 'ok') return c.json({ error: result }, 400)

  const userId = (await findUserIdByEmail(email)) ?? (await createUserWithEmail(email, readLang(body.lang)))
  await startSession(c, userId)
  return c.json({ ok: true })
})

/** Which login methods the app should offer right now. */
authRoutes.get('/providers', (c) => c.json({ email: true, telegram: telegramAvailable() }))

/** Telegram step 1: get a link that opens the bot. */
authRoutes.post('/telegram/start', (c) => {
  const login = createLogin()
  return login ? c.json(login) : c.json({ error: 'telegram_unavailable' }, 503)
})

/** Telegram step 2: the app checks whether the student has confirmed in Telegram. */
authRoutes.post('/telegram/poll', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (typeof body.pollToken !== 'string') return c.json({ status: 'expired' })

  const result = pollLogin(body.pollToken)
  if (typeof result === 'string') return c.json({ status: result })

  const userId =
    (await findUserIdByTelegramId(result.telegramId)) ??
    (await createUserWithTelegram(result.telegramId, result.name, readLang(body.lang)))
  await startSession(c, userId)
  return c.json({ status: 'ok' })
})

authRoutes.post('/logout', async (c) => {
  await endSession(c)
  return c.json({ ok: true })
})
