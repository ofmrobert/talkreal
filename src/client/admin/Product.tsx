import { Fragment, useState } from 'react'
import { Card, dateTime, inputClass, Loading, Meter, num, Page, pct, Pill, setUsdRate, Stat, Stats, Table, Td, Th, usdRate, useAdmin } from './ui'

/* The screens about the product itself: how the course is used, and the state of the system. */

interface LessonStat {
  users: number
  accuracy: number | null
  completions: number
}

interface Learning {
  levels: { level: string; n: number }[]
  placement: { method: string; level: string; n: number }[]
  review: Record<string, number>
  goals: Record<string, number>
  achievements: { key: string; icon: string; students: number }[]
  course: {
    level: string
    lessons: number
    exam: LessonStat
    units: { number: number; title: string; test: LessonStat; lessons: ({ id: string; order: number; title: string } & LessonStat)[] }[]
  }[]
}

export function LearningPage() {
  const { data, failed } = useAdmin<Learning>('/learning')
  const [level, setLevel] = useState('A1')
  if (!data) return <Loading failed={failed} />
  const students = data.levels.reduce((sum, l) => sum + l.n, 0)
  const course = data.course.find((c) => c.level === level) ?? data.course[0]
  const first = course.units[0]?.lessons[0]?.users ?? 0
  const maxUsers = Math.max(1, ...course.units.flatMap((u) => u.lessons.map((l) => l.users)))
  const byTest = data.placement.filter((p) => p.method === 'test').reduce((sum, p) => sum + p.n, 0)
  const bySelf = data.placement.filter((p) => p.method === 'self').reduce((sum, p) => sum + p.n, 0)

  return (
    <Page title="Learning" hint="How the course is really used: where students are, where they stop, and which lessons are too hard.">
      <Stats>
        {['A1', 'A2', 'B1', 'B2', 'C1'].map((l) => {
          const n = data.levels.find((x) => x.level === l)?.n ?? 0
          return <Stat key={l} label={`Level ${l}`} value={num(n)} sub={pct(n, students)} />
        })}
        <Stat label="No level yet" value={num(data.levels.find((x) => x.level === 'none')?.n ?? 0)} sub="Signed up, never chose a level" />
      </Stats>
      <Stats>
        <Stat label="Took the level test" value={num(byTest)} sub={`${num(bySelf)} chose a level themselves`} />
        <Stat label="Review items" value={num(data.review.items)} sub={`${num(data.review.students)} students`} />
        <Stat label="Due now" value={num(data.review.due)} />
        <Stat label="Well remembered" value={num(data.review.well_known)} sub="Answered right five times in a row" />
        <Stat label="Forgotten in review" value={num(data.review.lapses)} sub="Wrong answers in review, all time" />
      </Stats>

      <Card
        title="Lesson by lesson"
        hint="Students who finished each lesson, and their average best result. A sharp drop between two lessons shows where people give up; a low result shows a lesson that is too hard."
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {data.course.map((c) => (
            <button
              key={c.level}
              type="button"
              onClick={() => setLevel(c.level)}
              className={`rounded-md px-3 py-1.5 text-sm font-bold ${level === c.level ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {c.level}
            </button>
          ))}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Lesson</Th>
              <Th />
              <Th right>Finished by</Th>
              <Th right>Of lesson 1</Th>
              <Th right>Avg. result</Th>
              <Th right>Times done</Th>
            </tr>
          </thead>
          <tbody>
            {course.units.map((unit) => (
              <Fragment key={unit.number}>
                <tr>
                  <td colSpan={7} className="bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Unit {unit.number}: {unit.title}
                  </td>
                </tr>
                {unit.lessons.map((lesson) => (
                  <tr key={lesson.id}>
                    <Td className="font-mono text-xs">{lesson.order}</Td>
                    <Td className="max-w-72 truncate font-semibold text-slate-900">{lesson.title}</Td>
                    <Td className="w-1/4">
                      <Meter value={lesson.users} max={maxUsers} />
                    </Td>
                    <Td right>{num(lesson.users)}</Td>
                    <Td right>{pct(lesson.users, first)}</Td>
                    <Td right>
                      {lesson.accuracy === null ? '—' : <Pill tone={lesson.accuracy < 70 ? 'red' : lesson.accuracy < 80 ? 'amber' : 'green'}>{lesson.accuracy}%</Pill>}
                    </Td>
                    <Td right>{num(lesson.completions)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td />
                  <Td className="italic text-slate-500">Unit {unit.number} test passed</Td>
                  <Td>
                    <Meter value={unit.test.users} max={maxUsers} />
                  </Td>
                  <Td right>{num(unit.test.users)}</Td>
                  <Td right>{pct(unit.test.users, first)}</Td>
                  <Td right>{unit.test.accuracy === null ? '—' : `${unit.test.accuracy}%`}</Td>
                  <Td right>{num(unit.test.completions)}</Td>
                </tr>
              </Fragment>
            ))}
            <tr>
              <Td />
              <Td className="font-bold text-slate-900">Level exam passed</Td>
              <Td>
                <Meter value={course.exam.users} max={maxUsers} />
              </Td>
              <Td right>{num(course.exam.users)}</Td>
              <Td right>{pct(course.exam.users, first)}</Td>
              <Td right>{course.exam.accuracy === null ? '—' : `${course.exam.accuracy}%`}</Td>
              <Td right>{num(course.exam.completions)}</Td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <Card title="Why students learn English" hint="From their profiles; a student may pick up to three. Useful for choosing what to write and advertise next.">
        {Object.keys(data.goals).length === 0 ? (
          <p className="text-sm text-slate-400">Nobody has answered yet.</p>
        ) : (
          <Table>
            <tbody>
              {Object.entries(data.goals)
                .sort((a, b) => b[1] - a[1])
                .map(([goal, n]) => (
                  <tr key={goal}>
                    <Td className="w-40 font-semibold capitalize">{goal}</Td>
                    <Td>
                      <Meter value={n} max={Math.max(...Object.values(data.goals))} />
                    </Td>
                    <Td right>{num(n)}</Td>
                    <Td right className="w-20 text-slate-400">
                      {pct(n, students)}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Badges earned">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          {data.achievements.map((a) => (
            <div key={a.key} className="rounded-lg border border-slate-200 p-2 text-center">
              <div className="text-xl" aria-hidden="true">
                {a.icon}
              </div>
              <div className="text-xs font-semibold text-slate-500">{a.key.replace(/_/g, ' ')}</div>
              <div className="text-sm font-extrabold tabular-nums text-slate-900">{num(a.students)}</div>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  )
}

interface System {
  status: Record<string, string | number | boolean | null>
  counts: Record<string, number>
  actions: { id: string; admin: string; action: string; target: string | null; details: unknown; createdAt: string }[]
}

const STATUS: [string, string, (value: unknown) => { text: string; ok: boolean }][] = [
  ['database', 'Database', (v) => ({ text: v === 'postgresql' ? 'PostgreSQL (permanent)' : 'Embedded: data is lost on redeploy', ok: v === 'postgresql' })],
  ['payments', 'Payments', (v) => ({ text: v === 'yookassa' ? 'YooKassa connected' : v === 'mock' ? 'Test mode (no real money)' : 'Not connected: plans cannot be bought', ok: v === 'yookassa' })],
  ['receipts', 'Tax receipts with payments', (v) => ({ text: v ? 'On' : 'Off (fine for a self-employed seller)', ok: true })],
  ['voice', 'Voice calls', (v) => ({ text: v === 'gemini' ? 'On (Gemini)' : v === 'mock' ? 'Test stand-in' : 'Off', ok: v === 'gemini' })],
  ['textAi', 'Chat, reviews, answer check', (v) => ({ text: v ? 'On' : 'Off', ok: Boolean(v) })],
  ['email', 'Login emails', (v) => ({ text: v ? 'Configured' : 'Not configured: codes are not sent', ok: Boolean(v) })],
  ['telegram', 'Telegram login', (v) => ({ text: v ? 'On' : 'Off', ok: true })],
  ['testMode', 'Test mode', (v) => ({ text: v ? 'ON: login codes are shown on screen' : 'Off', ok: !v })],
]

export function SystemPage() {
  const { data, failed } = useAdmin<System>('/system')
  const [rate, setRate] = useState(usdRate())
  if (!data) return <Loading failed={failed} />
  return (
    <Page title="System" hint="What is switched on, and what was done in this panel.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Status">
          <Table>
            <tbody>
              {STATUS.map(([key, label, read]) => {
                const { text, ok } = read(data.status[key])
                return (
                  <tr key={key}>
                    <Td className="font-semibold">{label}</Td>
                    <Td>
                      <Pill tone={ok ? 'green' : 'amber'}>{ok ? 'OK' : 'Check'}</Pill>
                    </Td>
                    <Td>{text}</Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-slate-500">
            {String(data.status.lessons)} lessons loaded · {String(data.status.admins)} admin email(s) · running {String(data.status.uptimeHours)} h · Node {String(data.status.node)}
          </p>
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Stored right now">
            <Stats>
              <Stat label="Logged-in devices" value={num(data.counts.sessions)} />
              <Stat label="Notification devices" value={num(data.counts.push_devices)} />
              <Stat label="Reminders on" value={num(data.counts.reminders_on)} />
            </Stats>
            <p className="mt-3 text-xs text-slate-500">
              {num(data.counts.page_views)} visits and {num(data.counts.review_items)} review items stored.
            </p>
          </Card>
          <Card title="Dollar rate" hint="Used only to show approximate dollar amounts in this panel. Saved in this browser.">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              1 $ =
              <input
                className={`${inputClass} w-24`}
                type="number"
                min={1}
                value={rate}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setRate(next)
                  if (next > 0) setUsdRate(next)
                }}
              />
              ₽
            </label>
          </Card>
        </div>
      </div>
      <Card title="Admin log" hint="Plans given or removed and promo codes created or switched, newest first.">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>What</Th>
              <Th>Target</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {data.actions.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap">{dateTime(a.createdAt)}</Td>
                <Td>{a.admin}</Td>
                <Td className="font-semibold">{a.action.replace(/_/g, ' ')}</Td>
                <Td className="font-mono text-xs">{a.target ?? ''}</Td>
                <Td className="font-mono text-xs text-slate-500">{a.details ? JSON.stringify(a.details) : ''}</Td>
              </tr>
            ))}
            {data.actions.length === 0 && (
              <tr>
                <Td className="text-slate-400">Nothing yet.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </Page>
  )
}
