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

export type Exercise = ChoiceExercise | GapExercise | TranslateExercise | ListenExercise | MatchExercise

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

  if (!Array.isArray(l.exercises) || l.exercises.length < 10 || l.exercises.length > 14) {
    errors.push('"exercises" must have 10–14 items')
    return errors
  }

  const seen = new Set<string>()
  l.exercises.forEach((e, i) => {
    const where = `exercise ${i + 1} (${e?.type})`
    seen.add(e?.type)
    if (e?.type !== 'match' && !isText((e as Explained)?.explanation)) errors.push(`${where}: needs an "explanation"`)

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
