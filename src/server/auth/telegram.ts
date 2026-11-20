/**
 * Login through the Telegram bot.
 *
 * 1. The app asks for a login link and opens it: https://t.me/<bot>?start=<startParam>
 * 2. The student presses Start in Telegram. That is the confirmation.
 * 3. The app, which has been checking with its secret pollToken, sees it and logs the student in.
 *
 * The bot receives messages by "long polling" (the server keeps asking Telegram for news),
 * so no public address or domain is required.
 */
import { createHash, randomBytes } from 'node:crypto'
import { Agent, fetch } from 'undici'
import { env } from '../env'
import { linkTelegram } from '../pii'

const LOGIN_TTL_MS = 10 * 60 * 1000
const MAX_PENDING = 5000

interface PendingLogin {
  pollHash: string
  expiresAt: number
  confirmed?: { telegramId: string; name: string | null; username: string | null }
  /** Set when this is not a login but an existing student connecting Telegram for reminders. */
  linkUserId?: string
}

/** Waiting logins live in memory only: they are short-lived and hold no data worth keeping. */
const pending = new Map<string, PendingLogin>()
let botUsername: string | null = null
/** For diagnostics: why Telegram login is or is not available. */
let state: 'no_token' | 'connecting' | 'unreachable' | 'on' = 'no_token'
export const telegramState = () => state

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/**
 * Connections to Telegram are kept open and reused. Opening a new one can take seconds from
 * some networks, which would make the bot feel slow, so we also 'ping' regularly to keep one warm.
 */
const agent = new Agent({
  keepAliveTimeout: 120_000,
  keepAliveMaxTimeout: 600_000,
  connections: 4,
  // From Russia, some connection attempts to Telegram hang. Give up quickly and try again.
  connect: { timeout: 4000 },
})
const KEEP_WARM_EVERY_MS = 25_000

/** Timings for diagnostics, in milliseconds. */
const timings: { firstCall?: number; lastPing?: number; lastReply?: number; lastError?: string } = {}
export const telegramTimings = () => timings

async function call<T = unknown>(method: string, params: object = {}, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${env.telegram.apiBase}/bot${env.telegram.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(timeoutMs),
    dispatcher: agent,
  })
  const data = (await res.json()) as { ok: boolean; result: T; description?: string }
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`)
  return data.result
}

async function timed<T>(key: 'firstCall' | 'lastPing' | 'lastReply', action: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    return await action()
  } finally {
    timings[key] = Date.now() - started
  }
}

function findValid(startParam: string): PendingLogin | null {
  const login = pending.get(startParam)
  if (!login) return null
  if (login.expiresAt < Date.now()) {
    pending.delete(startParam)
    return null
  }
  return login
}

/** True when the bot is configured and Telegram is reachable from this server. */
export function telegramAvailable(): boolean {
  return botUsername !== null
}

export function createLogin(): { url: string; pollToken: string } | null {
  if (!botUsername) return null
  for (const [key, login] of pending) if (login.expiresAt < Date.now()) pending.delete(key)
  if (pending.size >= MAX_PENDING) return null

  const startParam = randomBytes(24).toString('base64url')
  const pollToken = randomBytes(32).toString('base64url')
  pending.set(startParam, { pollHash: hash(pollToken), expiresAt: Date.now() + LOGIN_TTL_MS })
  return { url: `https://t.me/${botUsername}?start=${startParam}`, pollToken }
}

/** A link that connects Telegram to an account that already exists (for reminders). */
export function createTelegramLink(userId: string): string | null {
  if (!botUsername) return null
  for (const [key, login] of pending) if (login.expiresAt < Date.now()) pending.delete(key)
  if (pending.size >= MAX_PENDING) return null

  const startParam = randomBytes(24).toString('base64url')
  pending.set(startParam, { pollHash: '', expiresAt: Date.now() + LOGIN_TTL_MS, linkUserId: userId })
  return `https://t.me/${botUsername}?start=${startParam}`
}

/**
 * Sends a message from the bot to one student. Resolves to false if it could not be delivered
 * (for example the student blocked the bot); it never throws.
 */
export async function sendTelegramMessage(telegramId: string, text: string, button?: { text: string; url: string }): Promise<boolean> {
  if (!botUsername) return false
  try {
    await call(
      'sendMessage',
      {
        chat_id: telegramId,
        text,
        ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
      },
      8000,
    )
    return true
  } catch (err) {
    console.error('Telegram message not delivered:', err instanceof Error ? err.message : err)
    return false
  }
}

export type PollResult = 'pending' | 'expired' | { telegramId: string; name: string | null; username: string | null }

/** Checks whether the student has confirmed in Telegram. A confirmed login can be collected once. */
export function pollLogin(pollToken: string): PollResult {
  const pollHash = hash(pollToken)
  for (const [startParam, login] of pending) {
    if (login.linkUserId || login.pollHash !== pollHash) continue
    if (login.expiresAt < Date.now()) {
      pending.delete(startParam)
      return 'expired'
    }
    if (!login.confirmed) return 'pending'
    pending.delete(startParam)
    return login.confirmed
  }
  return 'expired'
}

interface Update {
  update_id: number
  message?: { chat: { id: number }; from?: { id: number; first_name?: string; username?: string }; text?: string }
}

/** Sends a bot message in the background, so a slow reply never delays the login itself. */
function reply(chatId: number, text: string): void {
  const attempt = (triesLeft: number): Promise<unknown> =>
    call('sendMessage', { chat_id: chatId, text }, 6000).catch((err) => {
      if (triesLeft > 0) return attempt(triesLeft - 1)
      throw err
    })
  timed('lastReply', () => attempt(3)).catch((err) => {
    timings.lastError = new Date().toISOString() + ' reply: ' + (err instanceof Error ? err.message : String(err))
    console.error('Telegram reply failed:', timings.lastError)
  })
}

function handle(update: Update): void {
  const message = update.message
  if (!message?.text?.startsWith('/start')) return

  const startParam = message.text.split(' ')[1]
  const login = startParam ? findValid(startParam) : null
  if (login?.linkUserId && message.from && startParam) {
    pending.delete(startParam)
    const chatId = message.chat.id
    linkTelegram(login.linkUserId, String(message.from.id), message.from.username ?? null)
      .then((linked) =>
        reply(
          chatId,
          linked
            ? '🔔 Готово! Теперь я буду напоминать вам о занятиях. Отключить напоминания можно в профиле Talkreal.'
            : 'Этот Telegram уже привязан к другому аккаунту Talkreal. Войдите в приложение через Telegram, чтобы получать напоминания здесь.',
        ),
      )
      .catch((err) => console.error('Could not link Telegram:', err))
  } else if (login && message.from) {
    // Pressing Start is the confirmation: the app, which is already waiting, logs in at once.
    login.confirmed = { telegramId: String(message.from.id), name: message.from.first_name ?? null, username: message.from.username ?? null }
    reply(message.chat.id, '✅ Готово, вы вошли! Вернитесь в приложение Talkreal.')
  } else {
    reply(message.chat.id, 'Чтобы войти, откройте приложение Talkreal и нажмите «Войти через Telegram».')
  }
}

async function listen(): Promise<void> {
  let offset = 0
  for (;;) {
    try {
      const updates = await call<Update[]>(
        'getUpdates',
        { offset, timeout: 25, allowed_updates: ['message'] },
        35_000,
      )
      for (const update of updates) {
        offset = update.update_id + 1
        handle(update)
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      timings.lastError = new Date().toISOString() + ' ' + text
      console.error('Telegram polling error:', text)
      // 'Conflict' happens for a few seconds during an update, while the old copy of the server shuts down.
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

/** Connects to Telegram in the background. If it can't, Telegram login simply stays hidden. */
export async function startTelegramBot(): Promise<void> {
  if (!env.telegram.botToken) {
    console.log('Telegram login: off (TELEGRAM_BOT_TOKEN is not set)')
    return
  }
  state = 'connecting'
  for (;;) {
    try {
      const me = await timed('firstCall', () => call<{ username: string }>('getMe'))
      await call('deleteWebhook')
      botUsername = me.username
      state = 'on'
      console.log(`Telegram login: on (@${me.username})`)
      break
    } catch (err) {
      state = 'unreachable'
      const cause = err instanceof Error && err.cause instanceof Error ? ' / ' + err.cause.message : ''
      timings.lastError = (err instanceof Error ? err.message : String(err)) + cause
      console.error('Telegram login: cannot reach Telegram, retrying in 10s:', err instanceof Error ? err.message : err)
      await new Promise((r) => setTimeout(r, 10_000))
    }
  }
  void listen()
  setInterval(() => {
    timed('lastPing', () => call('getMe')).catch(() => {})
  }, KEEP_WARM_EVERY_MS)
}
