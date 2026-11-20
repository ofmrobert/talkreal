/**
 * Daily "time to practise" reminders.
 *
 * Every few minutes the server looks for students whose own clock shows their reminder hour,
 * who have not practised today and have not been reminded today, and writes to them
 * through Telegram and/or a phone notification.
 */
import { and, desc, eq, gt, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { sendTelegramMessage } from '../auth/telegram'
import { db } from '../db/client'
import { feedPosts, users } from '../db/schema'
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
export async function sendReminder(userId: string, text: ReminderText, lang: Lang, url = '/', tag = 'reminder') {
  const telegramId = await getTelegramId(userId)
  const [telegram, push] = await Promise.all([
    telegramId
      ? sendTelegramMessage(telegramId, `${text.title}\n${text.body}`, { text: TEXTS[lang].button, url: `${env.appUrl.replace(/\/$/, '')}${url === '/' ? '' : url}` || env.appUrl })
      : Promise.resolve(false),
    sendPush(userId, { ...text, url, tag: `talkreal-${tag}` }).catch((err) => {
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

/** The post of the day goes out at this hour of the student's own morning. */
const FEED_HOUR = 10

const KIND_TITLES: Record<string, { ru: string; en: string }> = {
  word: { ru: 'Слово дня', en: 'Word of the day' },
  mistake: { ru: 'Типичная ошибка', en: 'A typical mistake' },
  poll: { ru: 'Мини-тест дня', en: "Today's quiz" },
  fact: { ru: 'Интересный факт', en: 'Fun fact' },
  question: { ru: 'Вопрос дня', en: 'Question of the day' },
  picture: { ru: 'Опишите картинку', en: 'Describe the picture' },
  challenge: { ru: 'Новый челлендж недели', en: 'New weekly challenge' },
}

/**
 * Once a morning, tells students what is new in the feed: the weekly challenge on the day it
 * starts, otherwise the post of the day. Like the practice reminder, it stops after a week of silence.
 */
export async function feedTick(): Promise<void> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const fresh = await db
    .select()
    .from(feedPosts)
    .where(and(isNull(feedPosts.authorId), eq(feedPosts.status, 'active'), lte(feedPosts.publishAt, sql`now()`), gt(feedPosts.publishAt, dayAgo)))
    .orderBy(desc(feedPosts.publishAt))
  const post = fresh.find((p) => p.kind === 'challenge') ?? fresh[0]
  if (!post) return

  const candidates = await db.select().from(users).where(and(eq(users.notifyFeed, true), isNotNull(users.level)))
  const now = new Date()
  for (const user of candidates) {
    const timezone = safeTimezone(user.timezone)
    const today = localDay(timezone, now)
    if (localHour(timezone, now) !== FEED_HOUR || user.lastFeedPushDay === today) continue
    const lastSeen = user.lastActiveDate ?? localDay(timezone, user.createdAt)
    if (lastSeen < daysBack(today, GIVE_UP_AFTER_DAYS)) continue
    const claimed = await db
      .update(users)
      .set({ lastFeedPushDay: today })
      .where(and(eq(users.id, user.id), or(isNull(users.lastFeedPushDay), ne(users.lastFeedPushDay, today))))
      .returning({ id: users.id })
    if (claimed.length === 0) continue

    const lang: Lang = user.locale === 'en' ? 'en' : 'ru'
    const kind = KIND_TITLES[post.kind]?.[lang] ?? 'Talkreal'
    const title = `${post.body.emoji} ${kind}`
    const body = post.kind === 'challenge' ? `${post.body.title[lang]}. ${lang === 'en' ? 'The three best answers win XP.' : 'Три лучших ответа получат XP.'}` : (post.body.english ?? post.body.title[lang])
    await sendReminder(user.id, { title, body: body.slice(0, 140) }, lang, '/feed', 'feed').catch((err) => console.error('Feed notification failed:', err))
  }
}

export function startReminders(): void {
  const run = () =>
    tick()
      .catch((err) => console.error('Reminder check failed:', err))
      .then(feedTick)
      .catch((err) => console.error('Feed notification check failed:', err))
  // The first check waits a minute so the Telegram bot has time to connect after a restart.
  setTimeout(run, 60_000)
  setInterval(run, CHECK_EVERY_MS)
}
