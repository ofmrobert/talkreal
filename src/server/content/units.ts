import { existsSync, readFileSync } from 'node:fs'
import type { Lesson, Text } from '../../shared/lesson'
import { LEVELS, type Level } from '../../shared/levels'
import { lessonsFor } from './lessons'

const FILE = './content/units.json'

interface UnitsFile {
  lessonsPerUnit?: number
  units?: Partial<Record<Level, Text[]>>
}

function loadFile(): UnitsFile {
  if (!existsSync(FILE)) return {}
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as UnitsFile
  } catch (err) {
    console.warn(`Units file is not valid JSON: ${(err as Error).message}`)
    return {}
  }
}

const file = loadFile()
const PER_UNIT = Number.isInteger(file.lessonsPerUnit) && (file.lessonsPerUnit as number) > 0 ? (file.lessonsPerUnit as number) : 5

/** How many questions a test has, the share of first-try right answers needed to pass (in %), and its XP. */
export const UNIT_TEST = { size: 10, passMark: 70, xp: 20 }
export const LEVEL_EXAM = { size: 15, passMark: 80, xp: 40 }

export interface Unit {
  /** 1, 2, 3 … */
  number: number
  title: Text
  lessons: Lesson[]
  /** The id of the test that closes the unit, e.g. "a1-u2". */
  testId: string
}

export type NodeStatus = 'done' | 'open' | 'locked'

/** A level's lessons cut into units of five, in course order. */
export function unitsFor(level: Level): Unit[] {
  const lessons = lessonsFor(level)
  const titles = file.units?.[level] ?? []
  const units: Unit[] = []
  for (let start = 0; start < lessons.length; start += PER_UNIT) {
    const number = units.length + 1
    units.push({
      number,
      title: titles[number - 1] ?? { ru: `Раздел ${number}`, en: `Unit ${number}` },
      lessons: lessons.slice(start, start + PER_UNIT),
      testId: `${level.toLowerCase()}-u${number}`,
    })
  }
  return units
}

export const examId = (level: Level) => `${level.toLowerCase()}-exam`

export function nextLevel(level: Level): Level | null {
  return LEVELS[LEVELS.indexOf(level) + 1] ?? null
}

/** What a test id like "a1-u2" or "a1-exam" refers to. */
export function findTest(id: string): { kind: 'unit'; level: Level; unit: Unit } | { kind: 'exam'; level: Level } | null {
  const match = /^([a-c][12])-(u(\d+)|exam)$/.exec(id)
  const level = LEVELS.find((l) => l.toLowerCase() === match?.[1])
  if (!match || !level) return null
  if (match[2] === 'exam') return lessonsFor(level).length > 0 ? { kind: 'exam', level } : null
  const unit = unitsFor(level).find((u) => u.number === Number(match[3]))
  return unit ? { kind: 'unit', level, unit } : null
}

/**
 * What is finished, open and still locked in a level, given everything the student has completed
 * (lesson ids and test ids).
 *
 * - Lessons open one after another.
 * - A unit's test opens when all its lessons are done.
 * - The next unit opens when the test is passed.
 * - The level exam opens when every unit test is passed.
 * Anything already completed stays completed, whatever the order it was done in.
 */
export function courseState(level: Level, done: Set<string>) {
  const status = new Map<string, NodeStatus>()
  let reached = true // false once the path runs into something not yet finished

  for (const unit of unitsFor(level)) {
    let previousDone = true
    for (const lesson of unit.lessons) {
      const isDone = done.has(lesson.id)
      status.set(lesson.id, isDone ? 'done' : reached && previousDone ? 'open' : 'locked')
      previousDone = isDone
    }
    const allLessons = unit.lessons.every((l) => done.has(l.id))
    const passed = done.has(unit.testId)
    status.set(unit.testId, passed ? 'done' : reached && allLessons ? 'open' : 'locked')
    reached = reached && allLessons && passed
  }

  const exam = examId(level)
  // A level with no lessons yet has nothing to examine.
  status.set(exam, done.has(exam) ? 'done' : reached && status.size > 0 ? 'open' : 'locked')
  return status
}
