import { isLevel, type Level } from './levels'

/** Text shown in the interface language. */
export interface Text {
  ru: string
  en: string
}

/** A short rule explanation shown before the exercises. Body and tip are in Russian. */
export interface TheoryCard {
  title: string
  body: string
  examples: { en: string; ru: string }[]
  tip?: string
}

export interface VocabItem {
  en: string
  ru: string
  example?: string
}

interface Explained {
  /** Shown after the answer, in Russian: why this is the right answer. */
  explanation: string
}

/** Pick the right answer to a question. */
export interface ChoiceExercise extends Explained {
  type: 'choice'
  prompt: string
  options: string[]
  answer: number
}

/** A sentence with ___ and options to fill it. */
export interface GapExercise extends Explained {
  type: 'gap'
  sentence: string
  translation?: string
  options: string[]
  answer: number
}

/** Build the English translation of a Russian sentence from word tiles. */
export interface TranslateExercise extends Explained {
  type: 'translate'
  source: string
  answer: string
  /** Other correct translations. */
  accept?: string[]
  /** Extra wrong tiles. */
  distractors: string[]
}

/** Listen to an English sentence and pick the right option. */
export interface ListenExercise extends Explained {
  type: 'listen'
  audio: string
  question: string
  options: string[]
  answer: number
}

/** Match English words with their Russian meanings. */
export interface MatchExercise {
  type: 'match'
  pairs: { en: string; ru: string }[]
}

/** Type the English translation of a Russian sentence on the keyboard. */
export interface TypeExercise extends Explained {
  type: 'type'
  source: string
  answer: string
  /** Other correct translations. */
  accept?: string[]
}

/** Say an English sentence aloud. Skipped on devices that cannot recognise speech. */
export interface SpeakExercise {
  type: 'speak'
  text: string
  /** The Russian meaning, shown under the sentence. */
  translation: string
  explanation?: string
}

/** Hear an English sentence and type it. */
export interface DictationExercise {
  type: 'dictation'
  audio: string
  /** The Russian meaning, shown after the answer. */
  translation: string
  explanation?: string
}

export type Exercise =
  | ChoiceExercise
  | GapExercise
  | TranslateExercise
  | ListenExercise
  | MatchExercise
  | TypeExercise
  | SpeakExercise
  | DictationExercise

export interface Lesson {
  id: string
  level: Level
  /** Position in the level's course, starting from 1. */
  order: number
  title: Text
  goal: Text
  theory: TheoryCard[]
  vocab: VocabItem[]
  exercises: Exercise[]
}

/** Removes punctuation and case so "It's cold." equals "its cold" for answer checking. */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.,!?;:"«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The form two answers are compared in: like normalizeAnswer, and short forms are written out,
 * so "I don't know" equals "I do not know". Only short forms with one meaning are expanded
 * ("he's" can be "he is" or "he has", so it is left alone).
 */
export function answerKey(text: string): string {
  return normalizeAnswer(text)
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bcan not\b/g, 'cannot')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bshan't\b/g, 'shall not')
    .replace(/n't\b/g, ' not')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/'re\b/g, ' are')
    .replace(/'ve\b/g, ' have')
    .replace(/'ll\b/g, ' will')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True if what the student built or typed equals the answer or one of the accepted versions. */
export function isAccepted(given: string, exercise: { answer: string; accept?: string[] }): boolean {
  const key = answerKey(given)
  return [exercise.answer, ...(exercise.accept ?? [])].some((a) => answerKey(a) === key)
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** Words of a sentence for comparing speech: speech recognition writes "2" for "two" and so on. */
function spokenWords(text: string): string[] {
  return answerKey(text)
    .replace(/[-–—]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) && Number(w) < NUMBER_WORDS.length ? NUMBER_WORDS[Number(w)] : w))
}

/**
 * Compares what speech recognition heard with the sentence the student had to say.
 * Recognition is imperfect with learners' accents, so one word in four may be missing.
 * `words` lists the target words in order and whether each was heard.
 */
export function matchSpeech(target: string, heard: string[]): { passed: boolean; words: { word: string; heard: boolean }[] } {
  const display = toTiles(target)
  const wanted = display.map((w) => spokenWords(w))
  const total = wanted.flat().length
  const allowedMisses = total <= 2 ? 0 : Math.max(1, Math.floor(total * 0.25))

  let best: boolean[] = display.map(() => false)
  let bestMisses = total
  for (const attempt of heard) {
    const pool = spokenWords(attempt)
    let misses = 0
    const found = wanted.map((parts) => {
      let all = true
      for (const part of parts) {
        const at = pool.indexOf(part)
        if (at === -1) {
          all = false
          misses++
        } else pool.splice(at, 1)
      }
      return all
    })
    if (misses < bestMisses) {
      bestMisses = misses
      best = found
    }
  }
  return { passed: total > 0 && bestMisses <= allowedMisses, words: display.map((word, i) => ({ word, heard: best[i] })) }
}

/** Splits an English sentence into the tiles a student taps. */
export function toTiles(sentence: string): string[] {
  return sentence
    .replace(/[.,!?;:"]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isBilingual = (v: unknown): v is Text =>
  typeof v === 'object' && v !== null && isText((v as Text).ru) && isText((v as Text).en)

function checkOptions(e: { options?: unknown; answer?: unknown }, where: string, errors: string[]) {
  const options = e.options
  if (!Array.isArray(options) || options.length < 3 || options.length > 4 || !options.every(isText)) {
    errors.push(`${where}: "options" must be 3 or 4 non-empty texts`)
    return
  }
  if (new Set(options).size !== options.length) errors.push(`${where}: options must all be different`)
  if (!Number.isInteger(e.answer) || (e.answer as number) < 0 || (e.answer as number) >= options.length) {
    errors.push(`${where}: "answer" must be the position of the correct option (0 = first)`)
  }
}

/** Checks a lesson file. Returns a list of problems in plain words; an empty list means it is valid. */
export function validateLesson(data: unknown): string[] {
  const errors: string[] = []
  if (typeof data !== 'object' || data === null) return ['the file must contain one lesson object']
  const l = data as Partial<Lesson>

  if (!isText(l.id) || !/^[a-c][12]-\d{2}$/.test(l.id)) errors.push('"id" must look like "a2-03"')
  if (!isLevel(l.level)) errors.push('"level" must be one of A1, A2, B1, B2, C1')
  if (isText(l.id) && isLevel(l.level) && !l.id.startsWith(l.level.toLowerCase())) {
    errors.push('"id" must start with the level, e.g. level A2 → "a2-03"')
  }
  if (!Number.isInteger(l.order) || (l.order as number) < 1) errors.push('"order" must be a whole number from 1')
  if (!isBilingual(l.title)) errors.push('"title" needs both "ru" and "en"')
  if (!isBilingual(l.goal)) errors.push('"goal" needs both "ru" and "en"')

  if (!Array.isArray(l.theory) || l.theory.length < 1 || l.theory.length > 4) {
    errors.push('"theory" must have 1–4 cards')
  } else {
    l.theory.forEach((card, i) => {
      const where = `theory card ${i + 1}`
      if (!isText(card?.title) || !isText(card?.body)) errors.push(`${where}: needs "title" and "body"`)
      if (!Array.isArray(card?.examples) || card.examples.length < 1) {
        errors.push(`${where}: needs at least one example`)
      } else if (!card.examples.every((ex) => isText(ex?.en) && isText(ex?.ru))) {
        errors.push(`${where}: every example needs "en" and "ru"`)
      }
    })
  }

  if (!Array.isArray(l.vocab) || l.vocab.length < 4 || l.vocab.length > 10) {
    errors.push('"vocab" must have 4–10 words')
  } else if (!l.vocab.every((v) => isText(v?.en) && isText(v?.ru))) {
    errors.push('every vocab item needs "en" and "ru"')
  }

  if (!Array.isArray(l.exercises) || l.exercises.length < 10 || l.exercises.length > 16) {
    errors.push('"exercises" must have 10–16 items')
    return errors
  }

  const seen = new Set<string>()
  l.exercises.forEach((e, i) => {
    const where = `exercise ${i + 1} (${e?.type})`
    seen.add(e?.type)
    const explained = e?.type !== 'match' && e?.type !== 'speak' && e?.type !== 'dictation'
    if (explained && !isText((e as Explained)?.explanation)) errors.push(`${where}: needs an "explanation"`)

    switch (e?.type) {
      case 'choice':
        if (!isText(e.prompt)) errors.push(`${where}: needs a "prompt"`)
        checkOptions(e, where, errors)
        break
      case 'gap':
        if (!isText(e.sentence) || e.sentence.split('___').length !== 2) {
          errors.push(`${where}: "sentence" must contain ___ exactly once`)
        }
        checkOptions(e, where, errors)
        break
      case 'listen':
        if (!isText(e.audio) || !isText(e.question)) errors.push(`${where}: needs "audio" and "question"`)
        checkOptions(e, where, errors)
        break
      case 'translate': {
        if (!isText(e.source) || !isText(e.answer)) {
          errors.push(`${where}: needs "source" and "answer"`)
          break
        }
        const tiles = toTiles(e.answer).map((t) => t.toLowerCase())
        if (tiles.length < 2 || tiles.length > 12) errors.push(`${where}: the answer must be 2–12 words`)
        if (!Array.isArray(e.distractors) || e.distractors.length < 2 || e.distractors.length > 5 || !e.distractors.every(isText)) {
          errors.push(`${where}: needs 2–5 "distractors"`)
        } else if (e.distractors.some((d) => /\s/.test(d.trim()) || tiles.includes(d.toLowerCase()))) {
          errors.push(`${where}: each distractor must be a single word that is not in the answer`)
        }
        if (e.accept !== undefined && (!Array.isArray(e.accept) || !e.accept.every(isText))) {
          errors.push(`${where}: "accept" must be a list of texts`)
        }
        break
      }
      case 'type':
        if (!isText(e.source) || !isText(e.answer)) {
          errors.push(`${where}: needs "source" and "answer"`)
          break
        }
        if (toTiles(e.answer).length > 12) errors.push(`${where}: the answer must be at most 12 words`)
        if (e.accept !== undefined && (!Array.isArray(e.accept) || !e.accept.every(isText))) {
          errors.push(`${where}: "accept" must be a list of texts`)
        }
        break
      case 'speak':
        if (!isText(e.text) || !isText(e.translation)) errors.push(`${where}: needs "text" and "translation"`)
        else if (toTiles(e.text).length < 2 || toTiles(e.text).length > 12) errors.push(`${where}: the text must be 2–12 words`)
        break
      case 'dictation':
        if (!isText(e.audio) || !isText(e.translation)) errors.push(`${where}: needs "audio" and "translation"`)
        else if (toTiles(e.audio).length < 2 || toTiles(e.audio).length > 12) errors.push(`${where}: the audio must be 2–12 words`)
        else if (/\d/.test(e.audio)) errors.push(`${where}: write numbers as words, so there is one way to type them`)
        break
      case 'match':
        if (!Array.isArray(e.pairs) || e.pairs.length < 4 || e.pairs.length > 5) {
          errors.push(`${where}: needs 4–5 pairs`)
        } else if (!e.pairs.every((p) => isText(p?.en) && isText(p?.ru))) {
          errors.push(`${where}: every pair needs "en" and "ru"`)
        } else if (new Set(e.pairs.map((p) => p.en)).size !== e.pairs.length || new Set(e.pairs.map((p) => p.ru)).size !== e.pairs.length) {
          errors.push(`${where}: words must not repeat`)
        }
        break
      default:
        errors.push(`exercise ${i + 1}: unknown type "${(e as { type?: string })?.type}"`)
    }
  })

  for (const type of ['choice', 'gap', 'translate', 'listen'] as const) {
    if (!seen.has(type)) errors.push(`the lesson needs at least one "${type}" exercise`)
  }
  return errors
}

/**
 * For dictation: is this what was said? Things that cannot be heard do not count against the
 * student: a hyphen, or whether two words are written together ("every day" / "everyday").
 */
export function soundsTheSame(given: string, said: string): boolean {
  const heard = (text: string) => answerKey(text).replace(/[-–—\s]/g, '')
  return isAccepted(given, { answer: said }) || heard(given) === heard(said)
}
