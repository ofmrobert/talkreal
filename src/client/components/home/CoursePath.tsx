import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Text } from '../../../shared/lesson'
import { CheckIcon, CrownIcon, LockIcon, StarIcon, TrophyIcon } from '../icons'
import Button from '../ui/Button'

type Status = 'done' | 'open' | 'locked'

export interface PathLesson {
  id: string
  order: number
  title: Text
  goal: Text
  exercises: number
  status: Status
  bestAccuracy: number | null
}

export interface PathTest {
  id: string
  status: Status
  bestAccuracy: number | null
  questions: number
  passMark: number
}

export interface PathUnit {
  number: number
  title: Text
  lessons: PathLesson[]
  test: PathTest
}

export interface PathExam extends PathTest {
  nextLevel: string | null
}

interface Props {
  level: string
  units: PathUnit[]
  exam: PathExam
}

/** Each unit has its own colour, so the path changes as the student moves on. */
const COLORS = [
  { main: '#FF6B4A', dark: '#E2512F', ring: 'rgba(255,107,74,0.45)' },
  { main: '#7C5CFF', dark: '#5B3FD6', ring: 'rgba(124,92,255,0.45)' },
  { main: '#2EC4A0', dark: '#1FA283', ring: 'rgba(46,196,160,0.45)' },
  { main: '#3D9BFF', dark: '#2379D8', ring: 'rgba(61,155,255,0.45)' },
]
const LOCKED = { main: '#E9E4DE', dark: '#D3CCC3', ring: 'transparent' }
const GOLD = { main: '#FFC53D', dark: '#E0A21A', ring: 'rgba(255,197,61,0.55)' }

/** How far each node sits from the middle, in pixels: the path winds left and right. */
const WAVE = [0, 44, 70, 44, 0, -44, -70, -44]

export function starsFor(accuracy: number): number {
  return accuracy >= 95 ? 3 : accuracy >= 75 ? 2 : 1
}

function Stars({ accuracy }: { accuracy: number }) {
  const stars = starsFor(accuracy)
  return (
    <span className="flex justify-center gap-0.5" aria-label={`${accuracy}%`}>
      {[1, 2, 3].map((n) => (
        <StarIcon key={n} width={14} height={14} className={n <= stars ? 'text-sun' : 'text-ink/15'} />
      ))}
    </span>
  )
}

type Selected = { kind: 'lesson'; lesson: PathLesson } | { kind: 'test'; unit: PathUnit } | { kind: 'exam' }

interface NodeProps {
  status: Status
  color: (typeof COLORS)[number]
  /** Where the node sits on the wave. */
  step: number
  current: boolean
  big?: boolean
  label: string
  icon: ReactNode
  accuracy: number | null
  onClick: () => void
  nodeRef?: (el: HTMLDivElement | null) => void
}

function PathNode({ status, color, step, current, big = false, label, icon, accuracy, onClick, nodeRef }: NodeProps) {
  const { t } = useTranslation()
  const paint = status === 'locked' ? LOCKED : color
  const size = big ? 'h-[5.25rem] w-[5.25rem] rounded-[1.75rem]' : 'h-[4.5rem] w-[4.5rem] rounded-full'
  return (
    <div
      ref={nodeRef}
      className={`relative flex flex-col items-center gap-1.5 ${current ? 'mt-9' : ''}`}
      style={{ transform: `translateX(${WAVE[step % WAVE.length]}px)` }}
    >
      {current && (
        <span className="path-hop absolute -top-9 left-1/2 z-[1] whitespace-nowrap rounded-xl border-2 border-ink/10 bg-white px-3 py-1 text-sm font-extrabold tracking-wide" style={{ color: paint.dark }}>
          {t('path.start')}
        </span>
      )}
      <span className={`relative flex ${current ? 'path-ring' : ''} ${big ? 'rounded-[1.75rem]' : 'rounded-full'}`} style={{ '--node-ring': paint.ring } as CSSProperties}>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={`path-node flex items-center justify-center ${size} ${status === 'locked' ? 'text-ink/30' : 'text-white'}`}
          style={{ background: paint.main, '--node-dark': paint.dark } as CSSProperties}
        >
          {status === 'locked' ? <LockIcon width={28} height={28} /> : icon}
        </button>
      </span>
      {status === 'done' && accuracy !== null && <Stars accuracy={accuracy} />}
    </div>
  )
}

/** The course as a winding path: units of lessons, a test after each unit, and the level exam at the end. */
export default function CoursePath({ level, units, exam }: Props) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'en' ? 'en' : 'ru'
  const [selected, setSelected] = useState<Selected | null>(null)
  const currentRef = useRef<HTMLDivElement | null>(null)

  // The first thing that is open and not finished yet: this is where the student continues.
  const currentId =
    units.flatMap((u) => [...u.lessons, u.test]).find((n) => n.status === 'open')?.id ?? (exam.status === 'open' ? exam.id : null)
  const started = units.some((u) => u.lessons.some((l) => l.status === 'done'))

  // Coming back to the course, show where to continue instead of the top of the path.
  useEffect(() => {
    if (started) currentRef.current?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  let step = 0

  function sheet() {
    if (!selected) return null
    const close = () => setSelected(null)
    let overline = ''
    let title = ''
    let text = ''
    let best: number | null = null
    let action: { label: string; to: string } | null = null
    let locked = false

    if (selected.kind === 'lesson') {
      const l = selected.lesson
      overline = `${t('lesson.lessonNumber', { number: l.order })} · ${t('home.exerciseCount', { count: l.exercises })}`
      title = l.title[lang]
      text = l.status === 'locked' ? t('path.lockedLesson') : l.goal[lang]
      best = l.bestAccuracy
      locked = l.status === 'locked'
      action = { label: t(l.status === 'done' ? 'path.repeatLesson' : 'path.startLesson'), to: `/lesson/${l.id}` }
    } else {
      const node = selected.kind === 'test' ? selected.unit.test : exam
      overline = `${t('test.questions', { count: node.questions })} · ${node.passMark}%`
      title = selected.kind === 'test' ? t('test.unitTitle', { number: selected.unit.number }) : t('test.examTitle', { level })
      locked = node.status === 'locked'
      text = locked
        ? t(selected.kind === 'test' ? 'path.lockedTest' : 'path.lockedExam')
        : selected.kind === 'test'
          ? t('test.unitText')
          : exam.nextLevel
            ? t('test.examText', { next: exam.nextLevel })
            : t('test.examTextLast')
      best = node.bestAccuracy
      action = { label: t(node.status === 'done' ? 'test.retake' : 'test.start'), to: `/test/${node.id}` }
    }

    return (
      <div className="fixed inset-0 z-20 flex items-end bg-ink/40" onClick={close}>
        <div className="sheet-up safe-bottom w-full rounded-t-3xl bg-cream px-5 pt-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="mx-auto flex max-w-md flex-col gap-3">
            <p className="text-xs font-extrabold uppercase tracking-wide text-ink/50">{locked ? t('path.lockedTitle') : overline}</p>
            <h3 className="text-2xl font-extrabold leading-tight">{title}</h3>
            <p className="text-base text-ink/70">{text}</p>
            {best !== null && !locked && (
              <p className="flex items-center gap-2 text-sm font-bold text-ink/60">
                <Stars accuracy={best} />
                {t('path.best', { accuracy: best })}
              </p>
            )}
            {locked || !action ? (
              <Button variant="secondary" onClick={close}>
                {t('path.ok')}
              </Button>
            ) : (
              <Button onClick={() => navigate(action.to)}>{action.label}</Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      {units.map((unit, index) => {
        const color = COLORS[index % COLORS.length]
        const done = unit.lessons.filter((l) => l.status === 'done').length
        const reached = unit.lessons.some((l) => l.status !== 'locked')
        return (
          <div key={unit.number} className="flex flex-col gap-7">
            <header
              className={`flex items-center gap-3 rounded-3xl p-4 ${reached ? 'text-white' : 'bg-[#E9E4DE] text-ink/45'}`}
              style={reached ? { background: color.main, boxShadow: `0 5px 0 0 ${color.dark}` } : undefined}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold uppercase tracking-wide opacity-80">{t('path.unit', { number: unit.number })}</p>
                <h3 className="text-xl font-extrabold leading-tight">{unit.title[lang]}</h3>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${reached ? 'bg-white/25' : 'bg-white/60'}`}>
                {done} / {unit.lessons.length}
              </span>
            </header>

            <ol className="flex flex-col items-center gap-6 pb-1 pt-4">
              {unit.lessons.map((lesson) => {
                const current = lesson.id === currentId
                return (
                  <li key={lesson.id}>
                    <PathNode
                      status={lesson.status}
                      color={color}
                      step={step++}
                      current={current}
                      label={`${t('lesson.lessonNumber', { number: lesson.order })}: ${lesson.title[lang]}`}
                      icon={lesson.status === 'done' ? <CheckIcon width={34} height={34} /> : <StarIcon width={34} height={34} />}
                      accuracy={lesson.bestAccuracy}
                      onClick={() => setSelected({ kind: 'lesson', lesson })}
                      nodeRef={current ? (el) => void (currentRef.current = el) : undefined}
                    />
                  </li>
                )
              })}
              <li>
                <PathNode
                  big
                  status={unit.test.status}
                  color={unit.test.status === 'done' ? GOLD : color}
                  step={step++}
                  current={unit.test.id === currentId}
                  label={t('test.unitTitle', { number: unit.number })}
                  icon={<TrophyIcon width={40} height={40} />}
                  accuracy={unit.test.bestAccuracy}
                  onClick={() => setSelected({ kind: 'test', unit })}
                  nodeRef={unit.test.id === currentId ? (el) => void (currentRef.current = el) : undefined}
                />
              </li>
            </ol>
          </div>
        )
      })}

      {units.length > 0 &&
        (exam.status === 'done' && !exam.nextLevel ? (
          <div className="rounded-3xl bg-sun/30 p-5 text-center">
            <CrownIcon width={44} height={44} className="mx-auto text-[#E0A21A]" />
            <h3 className="mt-1 text-2xl font-extrabold">{t('path.courseDoneTitle')}</h3>
            <p className="mt-1 text-base text-ink/70">{t('path.courseDoneText')}</p>
          </div>
        ) : (
          <div
            ref={exam.id === currentId ? currentRef : undefined}
            className={`flex items-center gap-4 rounded-3xl p-4 ${exam.status === 'locked' ? 'bg-[#E9E4DE] text-ink/45' : 'bg-ink text-white shadow-[0_6px_0_0_rgba(31,27,58,0.25)]'}`}
          >
            <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${exam.status === 'locked' ? 'bg-white/60' : 'bg-sun text-ink'}`}>
              {exam.status === 'locked' ? <LockIcon width={30} height={30} /> : <CrownIcon width={36} height={36} />}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-extrabold leading-tight">{t('path.examTitle', { level })}</h3>
              <p className="text-sm font-semibold opacity-75">
                {exam.status === 'locked' ? t('path.lockedExam') : `${t('test.questions', { count: exam.questions })} · ${exam.passMark}%`}
              </p>
            </div>
            {exam.status !== 'locked' && (
              <button
                type="button"
                onClick={() => setSelected({ kind: 'exam' })}
                className="min-h-12 shrink-0 rounded-2xl bg-sun px-4 text-base font-extrabold text-ink shadow-[0_4px_0_0_#E0A21A] active:translate-y-1 active:shadow-[0_1px_0_0_#E0A21A]"
              >
                {t(exam.status === 'done' ? 'test.retake' : 'test.start')}
              </button>
            )}
          </div>
        ))}

      {sheet()}
    </section>
  )
}
