/**
 * Login through the Telegram bot.
 *
 * 1. The app asks for a login link and opens it: https://t.me/<bot>?start=<startParam>
 * 2. The student presses Start in Telegram; the bot asks them to confirm with a button.
 * 3. The app, which has been checking every couple of seconds with its secret pollToken,
 *    sees the confirmation and the student is logged in.
 *
 * The bot receives messages by "long polling" (the server keeps asking Telegram for news),
 * so no public address or domain is required.
 */
import { createHash, randomBytes } from 'node:crypto'
import { env } from '../env'

const LOGIN_TTL_MS = 10 * 60 * 1000
const MAX_PENDING = 5000

interface PendingLogin {
  pollHash: string
  expiresAt: number
  confirmed?: { telegramId: string; name: string | null }
}

/** Waiting logins live in memory only: they are short-lived and hold no data worth keeping. */
const pending = new Map<string, PendingLogin>()
let botUsername: string | null = null

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

async function call<T = unknown>(method: string, params: object = {}, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(`${env.telegram.apiBase}/bot${env.telegram.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = (await res.json()) as { ok: boolean; result: T; description?: string }
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`)
  return data.result
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

export type PollResult = 'pending' | 'expired' | { telegramId: string; name: string | null }

/** Checks whether the student has confirmed in Telegram. A confirmed login can be collected once. */
export function pollLogin(pollToken: string): PollResult {
  const pollHash = hash(pollToken)
  for (const [startParam, login] of pending) {
    if (login.pollHash !== pollHash) continue
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
  message?: { chat: { id: number }; text?: string }
  callback_query?: {
    id: string
    data?: string
    from: { id: number; first_name?: string }
    message?: { chat: { id: number }; message_id: number }
  }
}

async function handle(update: Update): Promise<void> {
  const message = update.message
  if (message?.text?.startsWith('/start')) {
    const startParam = message.text.split(' ')[1]
    if (startParam && findValid(startParam)) {
      await call('sendMessage', {
        chat_id: message.chat.id,
        text: 'Вы входите в приложение Talkreal. Подтвердите вход, только если вы сами его начали.',
        reply_markup: { inline_keyboard: [[{ text: '✅ Войти в Talkreal', callback_data: `ok:${startParam}` }]] },
      })
    } else {
      await call('sendMessage', {
        chat_id: message.chat.id,
        text: 'Чтобы войти, откройте приложение Talkreal и нажмите «Войти через Telegram».',
      })
    }
    return
  }

  const query = update.callback_query
  if (query?.data?.startsWith('ok:')) {
    const login = findValid(query.data.slice(3))
    if (login) {
      login.confirmed = { telegramId: String(query.from.id), name: query.from.first_name ?? null }
    }
    await call('answerCallbackQuery', { callback_query_id: query.id })
    if (query.message) {
      await call('editMessageText', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        text: login
          ? 'Готово! Вернитесь в приложение Talkreal.'
          : 'Ссылка устарела. Начните вход в приложении заново.',
      })
    }
  }
}

async function listen(): Promise<void> {
  let offset = 0
  for (;;) {
    try {
      const updates = await call<Update[]>(
        'getUpdates',
        { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] },
        65_000,
      )
      for (const update of updates) {
        offset = update.update_id + 1
        await handle(update).catch((err) => console.error('Telegram update failed:', err))
      }
    } catch (err) {
      console.error('Telegram polling error:', err instanceof Error ? err.message : err)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

/** Connects to Telegram in the background. If it can't, Telegram login simply stays hidden. */
export async function startTelegramBot(): Promise<void> {
  if (!env.telegram.botToken) {
    console.log('Telegram login: off (TELEGRAM_BOT_TOKEN is not set)')
    return
  }
  for (;;) {
    try {
      const me = await call<{ username: string }>('getMe')
      await call('deleteWebhook')
      botUsername = me.username
      console.log(`Telegram login: on (@${me.username})`)
      break
    } catch (err) {
      console.error('Telegram login: cannot reach Telegram, retrying in 60s:', err instanceof Error ? err.message : err)
      await new Promise((r) => setTimeout(r, 60_000))
    }
  }
  void listen()
}
