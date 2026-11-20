import { and, desc, gte, lt } from 'drizzle-orm'
import type { PostBody, PostKind } from '../../shared/feed'
import { clip } from '../ai/text'
import { db } from '../db/client'
import { feedImages, feedPosts } from '../db/schema'
import { dayAfter, localDay } from '../progress/streak'
import { drawPicture, write, writerName } from './writer'

/**
 * Writes the Talkreal account's posts. One post a day, a week ahead, so the owner can read,
 * edit or remove any of them in the admin panel before it goes out.
 */

const ZONE = 'Europe/Moscow'
/** Posts go out at this hour, Moscow time. */
const PUBLISH_HOUR = 9
const DAYS_AHEAD = 7
/** What is posted on each day of the week, Sunday first. Two pictures a week. */
const WEEK: PostKind[] = ['picture', 'word', 'mistake', 'poll', 'picture', 'fact', 'question']

const BRIEF: Record<PostKind, string> = {
  word: 'A "word of the day" post: one genuinely useful English word or short phrase at B1 level that learners rarely know but natives use all the time. Give its meaning in Russian and one natural example sentence.',
  mistake:
    'A "typical mistake" post: one mistake Russian speakers really make in English (articles, prepositions, tenses, word order, false friends, literal translations). Show the wrong version, the right version, and explain why in one or two sentences.',
  poll: 'A quick quiz with exactly 3 options and exactly one correct answer, on everyday English that Russian speakers often get wrong. The options must be short. The wrong ones must be clearly wrong to a native speaker.',
  fact: 'A surprising, true and checkable fun fact about the English language or English-speaking culture (word origins, idioms, pronunciation, British vs American). Nothing doubtful: if you are not sure it is true, choose another fact.',
  question: 'An open question that invites students to answer in English in the comments, in one or two sentences. Easy to answer, about everyday life, with a sample answer so beginners know how to start.',
  picture: 'A "describe the picture" post. Invent a simple everyday scene (a street café, a kitchen, a park, an office) with 4 to 6 clearly visible things, and ask students to describe it in English. Give 5 useful words for it.',
}

const SYSTEM = `You write short social-media posts for the official account of Talkreal, an app that teaches English to adult Russian speakers. The posts appear in the app's feed.

Voice: warm, clever, brief. Like a favourite teacher who is also fun to follow. No hype, no emoji in the text itself (the app adds one).

Rules:
- All English in the post must be natural and correct. British spelling.
- The Russian must be natural, correct Russian. Address the reader as «вы».
- Every post is given in two versions of the explanation: "ru" for readers using the app in Russian, "en" for readers using it in English. The English word or phrase being taught is the same in both.
- Keep it short: a title of at most 8 words, a text of at most 60 words.
- Never repeat a topic from the list of recent posts you are given.

Return one JSON object with exactly these fields:
- "emoji": one emoji that fits the post.
- "title": {"ru": ..., "en": ...}
- "text": {"ru": ..., "en": ...}
- "english": the English word, phrase or sentence the post is about (for a fact or a question: the key phrase or the question itself).
- "options": for a quiz only, an array of exactly 3 short strings; otherwise null.
- "answer": for a quiz only, the position of the correct option (0, 1 or 2); otherwise null.
- "explanation": for a quiz only, {"ru": ..., "en": ...} saying why that option is right; otherwise null.
- "picture": for a "describe the picture" post only, one sentence in English describing the scene to draw, with no people's faces in close-up; otherwise null.`

interface Draft extends Partial<PostBody> {
  picture?: string | null
}

const MOCK: Record<PostKind, Draft> = {
  word: { emoji: '💡', title: { ru: 'Слово дня: handy', en: 'Word of the day: handy' }, text: { ru: 'Handy — «удобный, под рукой». This app is really handy.', en: 'Handy means useful and easy to use. This app is really handy.' }, english: 'handy' },
  mistake: { emoji: '🚫', title: { ru: 'Не говорите I am agree', en: "Don't say I am agree" }, text: { ru: 'Agree — глагол, поэтому am не нужен: I agree.', en: 'Agree is a verb, so no "am": I agree.' }, english: 'I agree' },
  poll: { emoji: '🧩', title: { ru: 'Как правильно?', en: 'Which is correct?' }, text: { ru: 'Выберите правильный вариант.', en: 'Choose the correct option.' }, english: 'I have lived here ___ 2019.', options: ['since', 'for', 'from'], answer: 0, explanation: { ru: 'Since — с какого момента.', en: 'Since is for a starting point.' } },
  fact: { emoji: '🤓', title: { ru: 'Знаете ли вы?', en: 'Did you know?' }, text: { ru: 'Слово goodbye произошло от God be with ye.', en: 'Goodbye comes from "God be with ye".' }, english: 'goodbye' },
  question: { emoji: '💬', title: { ru: 'Вопрос дня', en: 'Question of the day' }, text: { ru: 'Ответьте по-английски в комментариях. Например: I usually have coffee.', en: 'Answer in English in the comments. For example: I usually have coffee.' }, english: 'What do you usually have for breakfast?' },
  picture: { emoji: '🖼️', title: { ru: 'Опишите картинку', en: 'Describe the picture' }, text: { ru: 'Что вы видите? Слова: table, cup, window, plant, chair.', en: 'What can you see? Words: table, cup, window, plant, chair.' }, english: 'There is a cup on the table.', picture: 'A cosy café table by a window with a cup, a plant and a chair.' },
}

const bilingual = (value: unknown, max: number) => {
  const v = (value ?? {}) as { ru?: unknown; en?: unknown }
  const ru = clip(v.ru, max)
  const en = clip(v.en, max)
  return ru || en ? { ru: ru || en, en: en || ru } : null
}

/** Tidies what the AI returned into a post. Null if it is not usable. */
function toBody(kind: PostKind, draft: Draft): PostBody | null {
  const title = bilingual(draft.title, 120)
  const text = bilingual(draft.text, 600)
  if (!title || !text) return null
  const body: PostBody = { emoji: clip(draft.emoji, 8) || '✨', title, text, english: clip(draft.english, 200) || undefined }
  if (kind === 'poll') {
    const options = Array.isArray(draft.options) ? draft.options.map((o) => clip(o, 80)).filter(Boolean) : []
    const answer = Number(draft.answer)
    if (options.length < 2 || options.length > 4 || new Set(options).size !== options.length || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null
    body.options = options
    body.answer = answer
    body.explanation = bilingual(draft.explanation, 300) ?? undefined
  }
  return body
}

/** 09:00 Moscow time on the given day (Moscow is UTC+3 all year). */
const publishTime = (day: string) => new Date(`${day}T${String(PUBLISH_HOUR).padStart(2, '0')}:00:00+03:00`)

async function writePost(kind: PostKind, recent: string[]) {
  const prompt = `Write this post: ${BRIEF[kind]}\n\nRecent posts (do not repeat their topics):\n${recent.length ? recent.map((t) => `- ${t}`).join('\n') : '- none yet'}`
  const { value, by } = await write<Draft>(SYSTEM, prompt, () => MOCK[kind])
  const body = toBody(kind, value)
  if (!body) throw new Error(`the ${kind} post came back unusable`)
  const picture = kind === 'picture' && value.picture ? await drawPicture(clip(value.picture, 400)) : null
  return { body, by, picture }
}

/**
 * Makes sure there is a post for today and each of the next days. Safe to call often: days
 * that already have a post are left alone. Returns how many posts were written.
 */
export async function fillFeed(): Promise<{ written: number; failed: number }> {
  if (!writerName()) return { written: 0, failed: 0 }
  const today = localDay(ZONE)
  const existing = await db
    .select({ publishAt: feedPosts.publishAt })
    .from(feedPosts)
    .where(and(gte(feedPosts.publishAt, new Date(`${today}T00:00:00+03:00`)), lt(feedPosts.publishAt, new Date(`${dayAfter(today, DAYS_AHEAD)}T00:00:00+03:00`))))
  const taken = new Set(existing.map((post) => localDay(ZONE, post.publishAt)))
  const recent = (await db.select({ body: feedPosts.body }).from(feedPosts).orderBy(desc(feedPosts.publishAt)).limit(40)).map((post) => `${post.body.title.en}${post.body.english ? ` (${post.body.english})` : ''}`)

  let written = 0
  let failed = 0
  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const day = dayAfter(today, offset)
    if (taken.has(day)) continue
    const kind = WEEK[new Date(`${day}T12:00:00Z`).getUTCDay()]
    try {
      const post = await writePost(kind, recent)
      const [image] = post.picture ? await db.insert(feedImages).values(post.picture).returning({ id: feedImages.id }) : []
      // Today's post goes out at once if its hour has already passed.
      const at = publishTime(day)
      await db.insert(feedPosts).values({ kind, body: post.body, imageId: image?.id ?? null, publishAt: at.getTime() < Date.now() ? new Date(Date.now() - 60_000) : at, writtenBy: post.by })
      recent.unshift(post.body.title.en)
      written++
    } catch (err) {
      failed++
      console.error(`Could not write the feed post for ${day}:`, err instanceof Error ? err.message : err)
    }
  }
  if (written > 0) console.log(`Feed: wrote ${written} post(s)`)
  return { written, failed }
}

/**
 * Throws away the posts that have not gone out yet and writes them again: for when the writer
 * has changed (Claude now works) or the waiting posts are not good enough.
 */
export async function rewriteWaiting(): Promise<{ removed: number; written: number; failed: number }> {
  const removed = await db.delete(feedPosts).where(gte(feedPosts.publishAt, new Date())).returning({ id: feedPosts.id })
  return { removed: removed.length, ...(await fillFeed()) }
}

/** Keeps the feed a week ahead: shortly after the server starts, then every few hours. */
export function startFeed(): void {
  const run = () => fillFeed().catch((err) => console.error('Feed check failed:', err))
  setTimeout(run, 30_000)
  setInterval(run, 6 * 60 * 60 * 1000)
}
