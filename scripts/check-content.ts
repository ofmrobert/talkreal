// Checks every lesson file in content/lessons. Run with: npm run content:check
// Pass a level to check only that folder: npm run content:check -- a2
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateLesson, type Lesson } from '../src/shared/lesson'

const ROOT = 'content/lessons'
const only = process.argv[2]?.toLowerCase()
let files = 0
let problems = 0

for (const level of readdirSync(ROOT, { withFileTypes: true })) {
  if (!level.isDirectory() || (only && level.name !== only)) continue
  const orders = new Set<number>()

  for (const name of readdirSync(join(ROOT, level.name)).sort()) {
    if (!name.endsWith('.json')) continue
    files++
    const path = join(ROOT, level.name, name)
    let errors: string[]
    try {
      const lesson = JSON.parse(readFileSync(path, 'utf8')) as Lesson
      errors = validateLesson(lesson)
      if (lesson.level?.toLowerCase() !== level.name) errors.push(`is in folder "${level.name}" but its level is ${lesson.level}`)
      if (`${lesson.id}.json` !== name) errors.push(`file name must be "${lesson.id}.json"`)
      if (orders.has(lesson.order)) errors.push(`"order" ${lesson.order} is used by another lesson in this level`)
      orders.add(lesson.order)
    } catch (err) {
      errors = [`is not valid JSON: ${(err as Error).message}`]
    }
    if (errors.length > 0) {
      problems += errors.length
      console.log(`\n✗ ${path}`)
      for (const e of errors) console.log(`    - ${e}`)
    }
  }
}

console.log(`\n${files} lesson file(s) checked, ${problems} problem(s).`)
process.exit(problems > 0 ? 1 : 0)
