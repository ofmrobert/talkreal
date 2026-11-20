import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateLesson, type Lesson } from '../../shared/lesson'
import type { Level } from '../../shared/levels'

const ROOT = './content/lessons'

/**
 * Reads every lesson file once at startup. A file with problems is skipped (and reported
 * in the server log) so one bad lesson can never break the app.
 */
function loadLessons(): Lesson[] {
  const lessons: Lesson[] = []
  if (!existsSync(ROOT)) {
    console.warn(`Lessons folder not found: ${ROOT}`)
    return lessons
  }
  for (const folder of readdirSync(ROOT, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue
    for (const name of readdirSync(join(ROOT, folder.name))) {
      if (!name.endsWith('.json')) continue
      const path = join(ROOT, folder.name, name)
      try {
        const lesson = JSON.parse(readFileSync(path, 'utf8')) as Lesson
        const errors = validateLesson(lesson)
        if (errors.length > 0) {
          console.warn(`Lesson skipped: ${path}\n  - ${errors.join('\n  - ')}`)
          continue
        }
        lessons.push(lesson)
      } catch (err) {
        console.warn(`Lesson skipped (not valid JSON): ${path}: ${(err as Error).message}`)
      }
    }
  }
  console.log(`Lessons loaded: ${lessons.length}`)
  return lessons
}

const all = loadLessons()
const byId = new Map(all.map((l) => [l.id, l]))

/** How many lessons the server has loaded: shown by the health check, to confirm a release. */
export const lessonCount = all.length

/** A level's lessons in course order. */
export function lessonsFor(level: Level): Lesson[] {
  return all.filter((l) => l.level === level).sort((a, b) => a.order - b.order)
}

export function lessonById(id: string): Lesson | undefined {
  return byId.get(id)
}
