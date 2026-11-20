import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Level } from '../../shared/levels'
import type { CallReport } from '../../shared/report'
import { askJson, clip, textAiAvailable, type Turn } from '../ai/text'
import { db } from '../db/client'
import { reviewItems, voiceSessions } from '../db/schema'
import { dayAfter } from '../progress/streak'

/** A review is only worth writing if the student actually said something. */
const MIN_STUDENT_WORDS = 12
const MAX_CORRECTIONS = 5
const MAX_WORDS = 6

const SYSTEM = (level: Level) => `You are an experienced English teacher writing a short review of a speaking lesson for an adult student whose native language is Russian and whose level is ${level}.
You receive the transcript of a voice call between the student and a teacher. The student's lines come from speech recognition, so ignore punctuation, capital letters and obvious recognition glitches: only real language mistakes count.

Return one JSON object with exactly these fields:
- "summary": 1-2 warm, specific sentences in Russian about what the student did well in this conversation.
- "corrections": up to ${MAX_CORRECTIONS} of the student's most useful mistakes, most important first. Each is {"said": the student's own words (short, as said), "better": the correct natural English, "why": one short sentence in Russian explaining the rule}. Prefer mistakes typical for Russian speakers (articles, tenses, prepositions, word order). If there were no real mistakes, return an empty list.
- "words": up to ${MAX_WORDS} useful English words or short phrases from this conversation that are worth remembering at this level: words the teacher used that the student may not know, or better words for what the student tried to say. Each is {"en": the word or phrase, "ru": its Russian translation, "example": a short English sentence using it exactly as written in "en"}.
- "tip": one concrete piece of advice in Russian on what to practise next.

Write Russian naturally and address the student as «вы». Never invent mistakes that are not in the transcript.`

function sanitize(raw: Partial<CallReport> | null): CallReport {
  const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
  return {
    summary: clip(raw?.summary, 400),
    corrections: list<{ said?: unknown; better?: unknown; why?: unknown }>(raw?.corrections)
      .map((c) => ({ said: clip(c?.said, 200), better: clip(c?.better, 200), why: clip(c?.why, 300) }))
      .filter((c) => c.said && c.better)
      .slice(0, MAX_CORRECTIONS),
    words: list<{ en?: unknown; ru?: unknown; example?: unknown }>(raw?.words)
      .map((w) => ({ en: clip(w?.en, 60), ru: clip(w?.ru, 80), example: clip(w?.example, 160) }))
      .filter((w) => w.en && w.ru)
      .slice(0, MAX_WORDS),
    tip: clip(raw?.tip, 300),
  }
}

/** True if the call has enough of the student's speech to review. */
export function worthReviewing(transcript: Turn[]): boolean {
  const words = transcript.filter((t) => t.role === 'student').reduce((sum, t) => sum + t.text.split(/\s+/).filter(Boolean).length, 0)
  return textAiAvailable() && words >= MIN_STUDENT_WORDS
}

/**
 * Writes the review of a finished call and saves it with the call. The transcript itself is
 * never stored: it is used here once and then forgotten. The words from the review join the
 * student's review cycle, due tomorrow.
 */
export async function writeReport(callId: string, userId: string, level: Level, transcript: Turn[], today: string): Promise<void> {
  try {
    const text = transcript.map((t) => `${t.role === 'student' ? 'Student' : 'Teacher'}: ${t.text}`).join('\n')
    const raw = await askJson<Partial<CallReport>>({
      system: SYSTEM(level),
      turns: [{ role: 'student', text: `Transcript of the call:\n\n${text}` }],
      temperature: 0.3,
      timeoutMs: 30_000,
      mock: () => ({
        summary: 'Вы уверенно поддержали разговор и не боялись отвечать развёрнуто.',
        corrections: [{ said: 'I am agree', better: 'I agree', why: 'Agree — это глагол, поэтому am перед ним не нужен.' }],
        words: [{ en: 'to look forward to', ru: 'ждать с нетерпением', example: 'I look forward to the weekend.' }],
        tip: 'Потренируйте вопросы с do и does.',
      }),
    })
    const report = sanitize(raw)
    await db.update(voiceSessions).set({ report, reportStatus: 'ready' }).where(eq(voiceSessions.id, callId))

    if (report.words.length > 0) {
      await db
        .insert(reviewItems)
        .values(
          report.words.map((word) => ({
            userId,
            key: `c:${createHash('sha1').update(word.en.toLowerCase()).digest('hex').slice(0, 12)}`,
            lessonId: 'call',
            box: 1,
            dueDay: dayAfter(today),
            data: word,
          })),
        )
        .onConflictDoNothing()
    }
  } catch (err) {
    console.error('Could not write the call review:', err instanceof Error ? err.message : err)
    await db
      .update(voiceSessions)
      .set({ reportStatus: 'failed' })
      .where(eq(voiceSessions.id, callId))
      .catch(() => {})
  }
}
