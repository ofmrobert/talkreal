import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import Chai from '../components/Chai'
import { BoltIcon, FlameIcon } from '../components/icons'
import CoursePath, { type PathExam, type PathUnit } from '../components/home/CoursePath'
import { MascotSays, PhraseOfDay, TeacherOfDay, WeekStrip } from '../components/home/HomeExtras'
import FeedCard from '../components/home/FeedCard'
import NotifyPrompt from '../components/home/NotifyPrompt'
import Quests from '../components/home/Quests'
import { api } from '../lib/api'

interface Course {
  level: string
  xp: number
  streak: number
  streakFrozen?: boolean
  freezes?: number
  reviewDue?: number
  today: { xp: number; xpGoal: number; lessonsDone: number; lessonsLimit: number | null }
  week: { day: string; xp: number }[]
  units: PathUnit[]
  exam: PathExam
}

/** The daily goal as a ring that fills up. */
function GoalRing({ value }: { value: number }) {
  const radius = 26
  const length = 2 * Math.PI * radius
  const filled = Math.min(1, Math.max(0, value))
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
      <circle cx="34" cy="34" r={radius} fill="none" stroke="rgb(var(--shade)/0.1)" strokeWidth="8" />
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

/** Learn tab: today's numbers on top, then the course path for the student's level. */
export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [course, setCourse] = useState<Course | null>(null)
  const [failed, setFailed] = useState(false)

  /** Loads the course and today's numbers. Called again after a quest is collected, so the XP on screen is right. */
  function load() {
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)
    api<Course>(`/course?tz=${tz}`)
      .then(setCourse)
      .catch(() => setFailed(true))
  }
  useEffect(load, [])

  if (!course) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Chai size={110} />
        {failed && <p className="text-base font-bold text-ink/60">{t('login.errors.network')}</p>}
      </div>
    )
  }

  const lessons = course.units.flatMap((u) => u.lessons)
  const doneCount = lessons.filter((l) => l.status === 'done').length
  const limit = course.today.lessonsLimit
  const lessonsLeft = limit === null ? null : Math.max(0, limit - course.today.lessonsDone)

  return (
    <div className="flex flex-col gap-5">
      {/* Stays in view while the path scrolls underneath */}
      <header className="sticky top-0 z-[5] -mx-5 flex items-center justify-between bg-cream px-5 pb-2 pt-1 before:absolute before:inset-x-0 before:bottom-full before:h-24 before:bg-cream">
        <Link to="/placement" className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-3 text-sm font-extrabold active:translate-y-0.5">
          <span className="rounded-full bg-coral px-2.5 py-1 text-white">{course.level}</span>
          {t(`levels.${course.level}.name`)}
        </Link>
        <div className="flex gap-2">
          <span className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-extrabold" aria-label={t('home.streak')}>
            <FlameIcon width={18} height={18} className={course.streak > 0 ? 'text-bad' : 'text-ink/30'} />
            {course.streak}
          </span>
          {(course.freezes ?? 0) > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-extrabold" aria-label={t('freeze.label')}>
              <span aria-hidden="true">🧊</span>
              {course.freezes}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-extrabold" aria-label={t('home.xp')}>
            <BoltIcon width={18} height={18} className="text-sun" />
            {course.xp}
          </span>
        </div>
      </header>

      {course.streakFrozen && (
        <section className="flex items-center gap-3 rounded-3xl bg-sky-soft p-4" role="status">
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

      <NotifyPrompt />

      {/* Daily goal */}
      <section className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
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

      <Quests onClaim={load} />

      <FeedCard />

      {/* Words and mistakes that are due to be repeated */}
      {(course.reviewDue ?? 0) > 0 && (
        <section className="flex items-center gap-4 rounded-3xl bg-violet-soft p-4 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet text-xl font-extrabold text-white">
            {Math.min(course.reviewDue ?? 0, 99)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-tight">{t('review.cardTitle')}</h2>
            <p className="text-sm font-semibold text-ink/60">{t('review.cardText', { count: course.reviewDue })}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/review')}
            className="min-h-12 shrink-0 rounded-2xl bg-violet px-4 text-base font-extrabold text-white shadow-[0_4px_0_0_var(--color-violet-dark)] active:translate-y-1 active:shadow-[0_1px_0_0_var(--color-violet-dark)]"
          >
            {t('review.start')}
          </button>
        </section>
      )}

      {/* The course path */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-extrabold">{t('home.courseTitle', { level: course.level })}</h2>
        <span className="text-sm font-bold text-ink/50">
          {doneCount} / {lessons.length}
        </span>
      </div>
      {lessons.length === 0 ? (
        <p className="rounded-2xl bg-card p-4 text-base text-ink/65">{t('home.noLessons')}</p>
      ) : (
        <CoursePath level={course.level} units={course.units} exam={course.exam} />
      )}

      <WeekStrip week={course.week} />
      <PhraseOfDay />
      <TeacherOfDay />
    </div>
  )
}
