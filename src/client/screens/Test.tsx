import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Exercise, Text } from '../../shared/lesson'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import { CrownIcon, TrophyIcon } from '../components/icons'
import ExercisePlayer, { type PlayResult } from '../components/lesson/ExercisePlayer'
import LessonSummary, { type LessonResult } from '../components/lesson/LessonSummary'
import Button from '../components/ui/Button'
import { api } from '../lib/api'
import { playComplete } from '../lib/sounds'

interface TestData {
  id: string
  kind: 'unit' | 'exam'
  level: string
  unit: { number: number; title: Text } | null
  passMark: number
  exercises: Exercise[]
}

interface TestResult extends LessonResult {
  passed: boolean
  passMark: number
  newLevel: string | null
}

type Stage = 'loading' | 'intro' | 'play' | 'saving' | 'result' | 'error'

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** A unit test or a level exam: a set of questions with a pass mark, and no rule cards to lean on. */
export default function Test() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const lang = i18n.language === 'en' ? 'en' : 'ru'

  const [stage, setStage] = useState<Stage>('loading')
  const [test, setTest] = useState<TestData | null>(null)
  const [result, setResult] = useState<TestResult | null>(null)
  const [seconds, setSeconds] = useState(0)
  /** Goes up for every attempt, so the player starts afresh with the new questions. */
  const [attempt, setAttempt] = useState(0)

  function load(next: Stage) {
    setStage('loading')
    api<TestData>(`/tests/${id}`)
      .then((data) => {
        setTest(data)
        setAttempt((a) => a + 1)
        setStage(data.exercises.length > 0 ? next : 'error')
      })
      .catch(() => setStage('error'))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load('intro'), [id])

  const leave = () => navigate('/', { replace: true })

  async function finish(play: PlayResult) {
    if (!test) return
    setStage('saving')
    setSeconds(play.seconds)
    try {
      const saved = await api<TestResult>(`/tests/${test.id}/complete`, {
        missed: play.missed.length,
        total: test.exercises.length,
        seconds: play.seconds,
        tz: timezone(),
      })
      setResult(saved)
      if (saved.passed) playComplete()
      setStage('result')
      void refresh()
    } catch {
      setStage('error')
    }
  }

  if (stage === 'loading' || stage === 'saving') {
    return (
      <div className="flex h-full items-center justify-center">
        <Chai size={120} />
      </div>
    )
  }

  if (stage === 'error' || !test) {
    return (
      <div className="safe-screen mx-auto flex h-full max-w-md flex-col items-center justify-center gap-5 text-center">
        <Chai size={140} />
        <div>
          <h1 className="text-3xl font-extrabold">{t('lesson.errorTitle')}</h1>
          <p className="mt-2 text-lg text-ink/65">{t('lesson.errorText')}</p>
        </div>
        <Button onClick={leave}>{t('lesson.backToCourse')}</Button>
      </div>
    )
  }

  const title = test.kind === 'unit' ? t('test.unitTitle', { number: test.unit?.number }) : t('test.examTitle', { level: test.level })

  if (stage === 'intro') {
    const Icon = test.kind === 'unit' ? TrophyIcon : CrownIcon
    return (
      <div className="safe-screen mx-auto flex h-full max-w-md flex-col">
        <button
          type="button"
          onClick={leave}
          aria-label={t('lesson.close')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold text-ink/45 active:bg-ink/10"
        >
          ✕
        </button>
        <div className="slide-in flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="pop-in flex h-28 w-28 items-center justify-center rounded-[2rem] bg-sun text-ink shadow-[0_7px_0_0_#E0A21A]">
            <Icon width={64} height={64} />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold leading-tight">{title}</h1>
            {test.unit && <p className="mt-1 text-lg font-bold text-ink/60">{test.unit.title[lang]}</p>}
          </div>
          <ul className="flex w-full flex-col gap-2 text-left">
            {[t('test.questions', { count: test.exercises.length }), t('test.passMark', { mark: test.passMark }), t('test.free')].map((line) => (
              <li key={line} className="rounded-2xl bg-white px-4 py-3 text-base font-bold shadow-[0_4px_0_0_rgba(31,27,58,0.06)]">
                {line}
              </li>
            ))}
          </ul>
        </div>
        <Button onClick={() => setStage('play')}>{t('test.start')}</Button>
      </div>
    )
  }

  if (stage === 'result' && result) {
    if (result.passed) {
      const headline = result.newLevel
        ? t('test.levelUp', { level: result.newLevel })
        : t(test.kind === 'unit' ? 'test.passedUnit' : 'test.passedExam')
      return <LessonSummary result={result} seconds={seconds} onContinue={leave} headline={headline} />
    }
    return (
      <div className="safe-screen mx-auto flex h-full max-w-md flex-col">
        <div className="slide-in flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <Chai size={150} />
          <div>
            <h1 className="text-3xl font-extrabold">{t('test.failTitle')}</h1>
            <p className="mt-2 text-lg text-ink/65">{t('test.failText', { accuracy: result.accuracy, mark: result.passMark })}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => load('play')}>{t('test.retry')}</Button>
          <Button variant="ghost" onClick={leave}>
            {t('lesson.backToCourse')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ExercisePlayer
      key={attempt}
      exercises={test.exercises}
      onFinish={finish}
      onExit={leave}
      exitTitle={t('test.exitTitle')}
      exitText={t('test.exitText')}
    />
  )
}
