import { createHash } from 'node:crypto'
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm'
import type { Exercise, Lesson, VocabItem } from '../../shared/lesson'
import { lessonById, lessonsFor } from '../content/lessons'
import { db } from '../db/client'
import { reviewItems } from '../db/schema'
import type { Tx } from './activity'
import { dayAfter } from './streak'

/**
 * Spaced repetition. Every item sits in a "box". A right answer moves it up one box and it
 * comes back after a longer gap; a wrong answer sends it back to box 0 and it returns tomorrow.
 * The gaps, in days, by box:
 */
const GAP_DAYS = [1, 2, 4, 8, 16, 32, 90]
/** A new word starts here: it was just practised in the lesson. */
const WORD_START_BOX = 1
/** Items in one review session. About three minutes. */
export const SESSION_SIZE = 12

const gapFor = (box: number) => GAP_DAYS[Math.min(box, GAP_DAYS.length - 1)]

/** The text that identifies an exercise, so it is still found if the lesson file is reordered. */
function exerciseText(e: Exercise): string | null {
  switch (e.type) {
    case 'choice':
      return e.prompt
    case 'gap':
      return e.sentence
    case 'listen':
    case 'dictation':
      return e.audio
    case 'translate':
    case 'type':
      return e.source
    // Matching has no single answer, and speaking depends on the device: neither is reviewed.
    default:
      return null
  }
}

function exerciseKey(lessonId: string, e: Exercise): string | null {
  const text = exerciseText(e)
  if (text === null) return null
  return `e:${lessonId}:${createHash('sha1').update(`${e.type}|${text}`).digest('hex').slice(0, 12)}`
}

const wordKey = (lessonId: string, word: VocabItem) => `w:${lessonId}:${word.en.toLowerCase()}`

/** After a lesson: its missed exercises come back tomorrow, and its words join the review cycle. */
export async function scheduleAfterLesson(tx: Tx, userId: string, lesson: Lesson, missed: number[], today: string) {
  const tomorrow = dayAfter(today)

  const missedKeys = new Set<string>()
  for (const index of missed) {
    const exercise = lesson.exercises[index]
    const key = exercise && exerciseKey(lesson.id, exercise)
    if (key) missedKeys.add(key)
  }
  if (missedKeys.size > 0) {
    await tx
      .insert(reviewItems)
      .values([...missedKeys].map((key) => ({ userId, key, lessonId: lesson.id, box: 0, dueDay: tomorrow })))
      .onConflictDoUpdate({ target: [reviewItems.userId, reviewItems.key], set: { box: 0, dueDay: tomorrow } })
  }

  const words = new Map(lesson.vocab.map((word) => [wordKey(lesson.id, word), word]))
  if (words.size > 0) {
    await tx
      .insert(reviewItems)
      .values([...words.keys()].map((key) => ({ userId, key, lessonId: lesson.id, box: WORD_START_BOX, dueDay: tomorrow })))
      // A word already in the cycle keeps its place.
      .onConflictDoNothing()
  }
}

export async function countDue(userId: string, today: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), lte(reviewItems.dueDay, today)))
  return row?.count ?? 0
}

function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items]
  const picked: T[] = []
  while (pool.length > 0 && picked.length < count) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return picked
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Turns a word into an exercise. It gets harder as the word moves up the boxes:
 * pick the English word → recognise it by ear → write it into a sentence yourself.
 */
function wordExercise(word: VocabItem, lesson: Lesson, box: number): Exercise | null {
  const others = lessonsFor(lesson.level)
    .flatMap((l) => l.vocab)
    .filter((v) => v.en.toLowerCase() !== word.en.toLowerCase() && v.ru.toLowerCase() !== word.ru.toLowerCase())
  const explanation = `${word.en} — ${word.ru}.${word.example ? ` Например: ${word.example}` : ''}`

  if (box >= 3 && word.example) {
    // Verbs are listed as "to carry", but the sentence has just "carry".
    const bare = word.en.replace(/^to\s+/i, '')
    const inSentence = new RegExp(`\\b${escapeRegExp(bare)}\\b`, 'i')
    if (inSentence.test(word.example)) {
      return {
        type: 'type',
        source: `Впишите слово «${word.ru}»: ${word.example.replace(inSentence, '___')}`,
        answer: bare,
        explanation,
      }
    }
  }

  const inRussian = box === 2
  const wrong = [...new Set(pickRandom(others, 12).map((v) => (inRussian ? v.ru : v.en)))].slice(0, 3)
  if (wrong.length < 2) return null
  const right = inRussian ? word.ru : word.en

  return inRussian
    ? { type: 'listen', audio: word.en, question: 'Что значит это слово?', options: [right, ...wrong], answer: 0, explanation }
    : { type: 'choice', prompt: `Как по-английски «${word.ru}»?`, options: [right, ...wrong], answer: 0, explanation }
}

function resolve(item: typeof reviewItems.$inferSelect): Exercise | null {
  const lesson = lessonById(item.lessonId)
  if (!lesson) return null
  if (item.key.startsWith('e:')) return lesson.exercises.find((e) => exerciseKey(lesson.id, e) === item.key) ?? null
  const word = lesson.vocab.find((w) => wordKey(lesson.id, w) === item.key)
  return word ? wordExercise(word, lesson, item.box) : null
}

/** The next review session: the items that have waited longest, each as a ready-to-play exercise. */
export async function buildSession(userId: string, today: string): Promise<{ id: string; exercise: Exercise }[]> {
  const due = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), lte(reviewItems.dueDay, today)))
    .orderBy(asc(reviewItems.dueDay), asc(reviewItems.box))
    .limit(SESSION_SIZE * 2)

  const session: { id: string; exercise: Exercise }[] = []
  const gone: string[] = []
  for (const item of due) {
    const exercise = resolve(item)
    if (!exercise) gone.push(item.key)
    else if (session.length < SESSION_SIZE) session.push({ id: item.key, exercise })
  }
  // The lesson file was edited and the exercise or word no longer exists: forget it.
  if (gone.length > 0) {
    await db.delete(reviewItems).where(and(eq(reviewItems.userId, userId), inArray(reviewItems.key, gone)))
  }
  return pickRandom(session, session.length)
}

/**
 * Moves the reviewed items to their new boxes. Only items that really are due count,
 * so a session cannot be sent twice. Returns how many were reviewed and how many were right.
 */
export async function applyResults(tx: Tx, userId: string, results: { id: string; correct: boolean }[], today: string) {
  const answers = new Map(results.map((r) => [r.id, r.correct]))
  if (answers.size === 0) return { reviewed: 0, correct: 0 }

  const due = await tx
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), inArray(reviewItems.key, [...answers.keys()]), lte(reviewItems.dueDay, today)))

  let correct = 0
  for (const item of due) {
    const right = answers.get(item.key) === true
    if (right) correct++
    const box = right ? item.box + 1 : 0
    await tx
      .update(reviewItems)
      .set({ box, dueDay: dayAfter(today, gapFor(box)), lapses: item.lapses + (right ? 0 : 1) })
      .where(and(eq(reviewItems.userId, userId), eq(reviewItems.key, item.key)))
  }
  return { reviewed: due.length, correct }
}
