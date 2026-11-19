import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Text } from '../../shared/lesson'
import Chai from '../components/Chai'
import { BoltIcon, FlameIcon } from '../components/icons'
import { MascotSays, PhraseOfDay, TeacherOfDay, WeekStrip } from '../components/home/HomeExtras'
import Button from '../components/ui/Button'
import { api } from '../lib/api'

interface CourseLesson {
  id: string
  order: number
  title: Text
  goal: Text
  exercises: number
  status: 'done' | 'open' | 'locked'
  bestAccuracy: number | null
}

interface Course {
  level: string
  xp: number
  streak: number
  streakFrozen?: boolean
  freezes?: number
  reviewDue?: number
  today: { xp: number; xpGoal: number; lessonsDone: number; lessonsLimit: number | null }
  week: { day: string; xp: number }[]
  lessons: CourseLesson[]
}

/** The daily goal as a ring that fills up. */
function GoalRing({ value }: { value: number }) {
  const radius = 26
  const length = 2 * Math.PI * radius
  const filled = Math.min(1, Math.max(0, value))
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
      <circle cx="34" cy="34" r={radius} fill="none" stroke="rgba(31,27,58,0.1)" strokeWidth="8" />
      <circle
        cx="34"
        cy="34"
        r={radius}
        fill="none"
        stroke={filled >= 1 ? 'var(--color-mint)' : 'var(--color-sun)'}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - filled)}
        transform="rotate(-90 34 34)"
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
      <text x="34" y="39" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--color-ink)">
        {Math.round(filled * 100)}%
      </text>
    </svg>
  )
}

function Stars({ accuracy }: { accuracy: number }) {
  const stars = accuracy >= 95 ? 3 : accuracy >= 75 ? 2 : 1
  return (
    <span className="text-sm tracking-tight" aria-label={`${accuracy}%`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= stars ? 'text-sun' : 'text-ink/15'}>
          ★
        </span>
      ))}
    </span>
  )
}

/** Learn tab: today's goal, the next lesson, and the course path for the student's level. */
export default function Home() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'en' ? 'en' : 'ru'
  const [course, setCourse] = useState<Course | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)
    api<Course>(`/course?tz=${tz}`)
      .then(setCourse)
      .catch(() => setFailed(true))
  }, [])

  if (!course) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Chai size={110} />
        {failed && <p className="text-base font-bold text-ink/60">{t('login.errors.network')}</p>}
      </div>
    )
  }

  const next = course.lessons.find((l) => l.status === 'open')
  const doneCount = course.lessons.filter((l) => l.status === 'done').length
  const limit = course.today.lessonsLimit
  const lessonsLeft = limit === null ? null : Math.max(0, limit - course.today.lessonsDone)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between pt-1">
        <Link to="/placement" className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 text-sm font-extrabold active:translate-y-0.5">
          <span className="rounded-full bg-coral px-2.5 py-1 text-white">{course.level}</span>
          {t(`levels.${course.level}.name`)}
        </Link>
        <div className="flex gap-2">
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold" aria-label={t('home.streak')}>
            <FlameIcon width={18} height={18} className={course.streak > 0 ? 'text-coral' : 'text-ink/30'} />
            {course.streak}
          </span>
          {(course.freezes ?? 0) > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold" aria-label={t('freeze.label')}>
              <span aria-hidden="true">🧊</span>
              {course.freezes}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold" aria-label={t('home.xp')}>
            <BoltIcon width={18} height={18} className="text-sun" />
            {course.xp}
          </span>
        </div>
      </header>

      {course.streakFrozen && (
        <section className="flex items-center gap-3 rounded-3xl bg-[#DDF1FF] p-4" role="status">
          <span className="text-3xl" aria-hidden="true">
            🧊
          </span>
          <div>
            <h2 className="text-base font-extrabold">{t('freeze.frozenTitle')}</h2>
            <p className="text-sm font-semibold text-ink/65">{t('freeze.frozenText')}</p>
          </div>
        </section>
      )}

      <MascotSays streak={course.streak} />

      {/* Daily goal */}
      <section className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-[0_5px_0_0_rgba(31,27,58,0.07)]">
        <GoalRing value={course.today.xp / course.today.xpGoal} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">{t('home.dailyGoal')}</h2>
          <p className="text-sm font-semibold text-ink/60">
            {course.today.xp >= course.today.xpGoal
              ? t('home.goalReached')
              : t('home.goalProgress', { xp: course.today.xp, goal: course.today.xpGoal })}
          </p>
          {lessonsLeft !== null && (
            <p className="mt-0.5 text-sm font-semibold text-ink/45">{t('home.lessonsLeft', { count: lessonsLeft })}</p>
          )}
        </div>
      </section>

      {/* The next lesson */}
      {next ? (
        <section className="relative overflow-hidden rounded-3xl bg-ink p-5 text-white shadow-[0_6px_0_0_rgba(31,27,58,0.25)]">
          <div className="absolute -right-3 -top-2 opacity-90">
            <Chai size={96} />
          </div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sun">
            {t('lesson.lessonNumber', { number: next.order })} · {t('home.minutes')}
          </p>
          <h2 className="mt-1 max-w-[75%] text-2xl font-extrabold leading-tight">{next.title[lang]}</h2>
          <p className="mt-1 max-w-[85%] text-base text-white/75">{next.goal[lang]}</p>
          <Button className="mt-4" onClick={() => navigate(`/lesson/${next.id}`)}>
            {doneCount === 0 ? t('home.startCourse') : t('home.continue')}
          </Button>
        </section>
      ) : (
        course.lessons.length > 0 && (
          <section className="rounded-3xl bg-mint/20 p-5 text-center">
            <h2 className="text-2xl font-extrabold">{t('home.levelDoneTitle')}</h2>
            <p className="mt-1 text-base text-ink/70">{t('home.levelDoneText')}</p>
            <Button className="mt-4" onClick={() => navigate('/placement')}>
              {t('home.nextLevel')}
            </Button>
          </section>
        )
      )}

      {/* Words and mistakes that are due to be repeated */}
      {(course.reviewDue ?? 0) > 0 && (
        <section className="flex items-center gap-4 rounded-3xl bg-[#EDE8FF] p-4 shadow-[0_5px_0_0_rgba(124,92,255,0.18)]">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#7C5CFF] text-xl font-extrabold text-white">
            {Math.min(course.reviewDue ?? 0, 99)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-tight">{t('review.cardTitle')}</h2>
            <p className="text-sm font-semibold text-ink/60">{t('review.cardText', { count: course.reviewDue })}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/review')}
            className="min-h-12 shrink-0 rounded-2xl bg-[#7C5CFF] px-4 text-base font-extrabold text-white shadow-[0_4px_0_0_#5B3FD6] active:translate-y-1 active:shadow-[0_1px_0_0_#5B3FD6]"
          >
            {t('review.start')}
          </button>
        </section>
      )}

      <WeekStrip week={course.week} />
      <PhraseOfDay />
      <TeacherOfDay />

      {/* The course path */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-extrabold">{t('home.courseTitle', { level: course.level })}</h2>
          <span className="text-sm font-bold text-ink/50">
            {doneCount} / {course.lessons.length}
          </span>
        </div>

        {course.lessons.length === 0 && <p className="rounded-2xl bg-white p-4 text-base text-ink/65">{t('home.noLessons')}</p>}

        <ol className="relative flex flex-col gap-3">
          {/* The line connecting the lessons */}
          <span className="absolute bottom-8 left-[1.6875rem] top-8 w-1 rounded-full bg-ink/10" aria-hidden="true" />
          {course.lessons.map((lesson) => {
            const locked = lesson.status === 'locked'
            const done = lesson.status === 'done'
            const isNext = lesson.id === next?.id
            const badge = done
              ? 'bg-mint text-white shadow-[0_4px_0_0_#1FA283]'
              : isNext
                ? 'bg-coral text-white shadow-[0_4px_0_0_var(--color-coral-dark)] pulse-ring'
                : 'bg-[#E9E4DE] text-ink/40'
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => navigate(`/lesson/${lesson.id}`)}
                  className="relative flex w-full items-center gap-4 text-left active:translate-y-0.5 disabled:active:translate-y-0"
                >
                  <span className={`relative z-[1] flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold ${badge}`}>
                    {done ? '✓' : locked ? '🔒' : lesson.order}
                  </span>
                  <span className={`min-w-0 flex-1 rounded-2xl p-3.5 ${locked ? 'bg-white/50' : 'bg-white shadow-[0_4px_0_0_rgba(31,27,58,0.06)]'}`}>
                    <span className={`block text-base font-extrabold leading-snug ${locked ? 'text-ink/40' : ''}`}>{lesson.title[lang]}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-ink/50">
                      {done && lesson.bestAccuracy !== null ? (
                        <>
                          <Stars accuracy={lesson.bestAccuracy} />
                          {t('home.repeat')}
                        </>
                      ) : (
                        t('home.exerciseCount', { count: lesson.exercises })
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
