/**
 * Daily "time to practise" reminders.
 *
 * Every few minutes the server looks for students whose own clock shows their reminder hour,
 * who have not practised today and have not been reminded today, and writes to them
 * through Telegram and/or a phone notification.
 */
import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm'
import { sendTelegramMessage } from '../auth/telegram'
import { db } from '../db/client'
import { users } from '../db/schema'
import { env } from '../env'
import { getTelegramId } from '../pii'
import { dayBefore, localDay, localHour, safeTimezone, streakNow } from '../progress/streak'
import { sendPush } from './push'

const CHECK_EVERY_MS = 5 * 60 * 1000
/** After this many days of silence we stop writing: nobody likes a bot that nags forever. */
const GIVE_UP_AFTER_DAYS = 7

type Lang = 'ru' | 'en'

interface ReminderText {
  title: string
  body: string
}

/** The texts rotate by day so the reminder does not read the same every evening. */
const TEXTS: Record<Lang, { streak: ((days: number) => ReminderText)[]; frozen: ReminderText; plain: ReminderText[]; button: string }> = {
  ru: {
    streak: [
      (days) => ({ title: `🔥 Серия ${days} дн. ждёт вас`, body: 'Один короткий урок — и серия продолжится. Это 5 минут.' }),
      (days) => ({ title: 'Чай уже заварен ☕', body: `Не дайте серии в ${days} дн. остыть: загляните на урок сегодня.` }),
      (days) => ({ title: '5 минут английского?', body: `Сегодня ещё не было урока. Серия: ${days} дн. — сохраним её?` }),
    ],
    frozen: { title: '🧊 Серия заморожена', body: 'Вчера вас спасла заморозка. Пройдите урок сегодня, иначе серия сгорит.' },
    plain: [
      { title: 'Пора немного поговорить по-английски', body: 'Один урок занимает 5 минут. Начнём серию сегодня?' },
      { title: 'Ваш урок готов ☕', body: 'Пять минут сегодня полезнее, чем час в выходные.' },
    ],
    button: 'Открыть Talkreal',
  },
  en: {
    streak: [
      (days) => ({ title: `🔥 Your ${days}-day streak is waiting`, body: 'One short lesson keeps it going. It takes 5 minutes.' }),
      (days) => ({ title: 'The tea is ready ☕', body: `Don't let your ${days}-day streak go cold: do a lesson today.` }),
      (days) => ({ title: '5 minutes of English?', body: `No lesson yet today. Streak: ${days} days. Shall we keep it?` }),
    ],
    frozen: { title: '🧊 Your streak is frozen', body: 'A freeze saved you yesterday. Do a lesson today or the streak is gone.' },
    plain: [
      { title: 'Time for a little English', body: 'One lesson takes 5 minutes. Start a streak today?' },
      { title: 'Your lesson is ready ☕', body: 'Five minutes today beats an hour at the weekend.' },
    ],
    button: 'Open Talkreal',
  },
}

function reminderText(lang: Lang, streak: number, frozen: boolean, day: string): ReminderText {
  const texts = TEXTS[lang]
  const turn = Number(day.slice(-2))
  if (frozen) return texts.frozen
  if (streak > 0) return texts.streak[turn % texts.streak.length](streak)
  return texts.plain[turn % texts.plain.length]
}

/** Sends one reminder through every channel the student has. Returns which ones worked. */
export async function sendReminder(userId: string, text: ReminderText, lang: Lang) {
  const telegramId = await getTelegramId(userId)
  const [telegram, push] = await Promise.all([
    telegramId
      ? sendTelegramMessage(telegramId, `${text.title}\n${text.body}`, { text: TEXTS[lang].button, url: env.appUrl })
      : Promise.resolve(false),
    sendPush(userId, { ...text, url: '/' }).catch((err) => {
      console.error('Push failed:', err)
      return 0
    }),
  ])
  return { telegram, push }
}

export function testReminderText(lang: Lang): ReminderText {
  return lang === 'en'
    ? { title: 'Talkreal reminders work ✅', body: 'This is how your daily reminder will look.' }
    : { title: 'Напоминания Talkreal работают ✅', body: 'Так будет выглядеть ваше ежедневное напоминание.' }
}

function daysBack(day: string, count: number): string {
  let result = day
  for (let i = 0; i < count; i++) result = dayBefore(result)
  return result
}

async function tick(): Promise<void> {
  // Only students who finished onboarding and left reminders on.
  const candidates = await db
    .select()
    .from(users)
    .where(and(eq(users.remindersEnabled, true), isNotNull(users.level)))

  const now = new Date()
  for (const user of candidates) {
    const timezone = safeTimezone(user.timezone)
    const today = localDay(timezone, now)
    if (localHour(timezone, now) !== user.reminderHour) continue
    if (user.lastReminderDay === today || user.lastActiveDate === today) continue

    // Stop after a week of silence (counted from the last lesson, or from signup if there was none).
    const lastSeen = user.lastActiveDate ?? localDay(timezone, user.createdAt)
    if (lastSeen < daysBack(today, GIVE_UP_AFTER_DAYS)) continue

    // Claim the day first: if two copies of the server run at once, only one of them sends.
    const claimed = await db
      .update(users)
      .set({ lastReminderDay: today })
      .where(and(eq(users.id, user.id), or(isNull(users.lastReminderDay), ne(users.lastReminderDay, today))))
      .returning({ id: users.id })
    if (claimed.length === 0) continue

    const streak = streakNow(user.currentStreak, user.lastActiveDate, today, user.streakFreezes)
    const lang: Lang = user.locale === 'en' ? 'en' : 'ru'
    await sendReminder(user.id, reminderText(lang, streak.streak, streak.frozen, today), lang).catch((err) =>
      console.error('Reminder failed:', err),
    )
  }
}

export function startReminders(): void {
  const run = () => tick().catch((err) => console.error('Reminder check failed:', err))
  // The first check waits a minute so the Telegram bot has time to connect after a restart.
  setTimeout(run, 60_000)
  setInterval(run, CHECK_EVERY_MS)
}
