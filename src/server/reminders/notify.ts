/**
 * Notifications about what happens around a student: a new follower, a private message, a
 * comment, a prize, the post of the day. They go out the same two ways as the practice
 * reminders (Telegram and phone notifications) and each kind can be switched off in the settings.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { users } from '../db/schema'
import { sendReminder } from './scheduler'

type Lang = 'ru' | 'en'
export type NoticeKind = 'social' | 'feed'
export type NoticeText = (lang: Lang) => { title: string; body: string }

/** When each "do not repeat" key was last used. Kept in memory: a restart only means one extra notification. */
const lastSent = new Map<string, number>()

/**
 * Sends a notification if the student wants this kind. `quiet` stops the same thing being
 * sent again too soon: a key that names it, and for how long to stay silent.
 * Never throws and is not awaited by the request that caused it.
 */
export function notify(userId: string, kind: NoticeKind, text: NoticeText, url: string, quiet?: { key: string; forMs: number }): void {
  if (quiet) {
    const last = lastSent.get(quiet.key) ?? 0
    if (Date.now() - last < quiet.forMs) return
    lastSent.set(quiet.key, Date.now())
    if (lastSent.size > 20_000) for (const [key, at] of lastSent) if (Date.now() - at > 24 * 60 * 60 * 1000) lastSent.delete(key)
  }
  void (async () => {
    const [user] = await db.select({ locale: users.locale, social: users.notifySocial, feed: users.notifyFeed }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user || !(kind === 'social' ? user.social : user.feed)) return
    const lang: Lang = user.locale === 'en' ? 'en' : 'ru'
    await sendReminder(userId, text(lang), lang, url, kind)
  })().catch((err) => console.error('Notification failed:', err instanceof Error ? err.message : err))
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The ready-made notifications. `name` is how the other student is shown to this one; null = they keep their profile closed. */
export const notices = {
  follower: (userId: string, from: string, name: string | null) =>
    notify(
      userId,
      'social',
      (lang) => (lang === 'en' ? { title: `${name ?? 'A student'} follows you 👋`, body: 'Have a look at their profile: maybe a practice partner.' } : { title: `${name ?? 'Ученик'} подписался(-ась) на вас 👋`, body: 'Загляните в профиль: возможно, это ваш партнёр для практики.' }),
      `/u/${from}`,
      { key: `follow:${from}:${userId}`, forMs: 24 * HOUR },
    ),
  request: (userId: string, from: string, name: string | null) =>
    notify(
      userId,
      'social',
      (lang) => (lang === 'en' ? { title: `${name ?? 'A student'} would like to talk ✉️`, body: 'Open the request to accept it or decline.' } : { title: `${name ?? 'Ученик'} хочет пообщаться ✉️`, body: 'Откройте запрос, чтобы принять его или отклонить.' }),
      `/messages/${from}`,
    ),
  message: (userId: string, from: string, name: string | null) =>
    notify(
      userId,
      'social',
      // The words of a message never go into a notification: it can be read on a locked screen.
      (lang) => (lang === 'en' ? { title: `${name ?? 'Talkreal'}`, body: 'New message ✉️' } : { title: `${name ?? 'Talkreal'}`, body: 'Новое сообщение ✉️' }),
      `/messages/${from}`,
      { key: `dm:${from}:${userId}`, forMs: 2 * MINUTE },
    ),
  accepted: (userId: string, from: string, name: string | null) =>
    notify(
      userId,
      'social',
      (lang) => (lang === 'en' ? { title: `${name ?? 'A student'} accepted your request 🎉`, body: 'You can write to each other now.' } : { title: `${name ?? 'Ученик'} принял(а) ваш запрос 🎉`, body: 'Теперь вы можете переписываться.' }),
      `/messages/${from}`,
    ),
  comment: (userId: string, postId: string, name: string | null) =>
    notify(
      userId,
      'social',
      (lang) => (lang === 'en' ? { title: 'New comment on your post 💬', body: `${name ?? 'A student'} answered you. Open the feed to read it.` } : { title: 'Новый комментарий к вашему посту 💬', body: `${name ?? 'Ученик'} ответил(а) вам. Откройте ленту, чтобы прочитать.` }),
      '/feed',
      { key: `comment:${postId}`, forMs: 15 * MINUTE },
    ),
  liked: (userId: string, postId: string) =>
    notify(
      userId,
      'social',
      (lang) => (lang === 'en' ? { title: 'People like your post ♥', body: 'Your English is being read. Keep writing!' } : { title: 'Ваш пост нравится ученикам ♥', body: 'Ваш английский читают. Пишите ещё!' }),
      '/feed',
      { key: `like:${postId}`, forMs: 12 * HOUR },
    ),
  teacherPost: (userId: string, teacherId: string, name: string | null, poll: boolean) =>
    notify(
      userId,
      'feed',
      (lang) =>
        lang === 'en'
          ? { title: `${name ?? 'Your teacher'} ${poll ? 'asks a question 🗳' : 'wrote a new post ✍️'}`, body: poll ? 'Answer it and see what the others chose.' : 'Read it and answer in English.' }
          : { title: `${name ?? 'Преподаватель'}: ${poll ? 'новый вопрос 🗳' : 'новый пост ✍️'}`, body: poll ? 'Ответьте и узнайте, что выбрали другие.' : 'Прочитайте и ответьте по-английски.' },
      '/feed',
      { key: `tpost:${teacherId}:${userId}`, forMs: 6 * HOUR },
    ),
  prize: (userId: string, place: number, xp: number) =>
    notify(
      userId,
      'social',
      (lang) =>
        lang === 'en'
          ? { title: `${['🥇', '🥈', '🥉'][place] ?? '🏆'} You won the weekly challenge!`, body: `Your answer took place ${place + 1}: +${xp} XP.` }
          : { title: `${['🥇', '🥈', '🥉'][place] ?? '🏆'} Вы победили в челлендже недели!`, body: `Ваш ответ занял ${place + 1}-е место: +${xp} XP.` },
      '/feed',
    ),
}
