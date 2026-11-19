import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Lesson as LessonData } from '../../shared/lesson'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import ExercisePlayer, { type PlayResult } from '../components/lesson/ExercisePlayer'
import LessonIntro from '../components/lesson/LessonIntro'
import LessonSummary, { type LessonResult } from '../components/lesson/LessonSummary'
import Button from '../components/ui/Button'
import { api, ApiError } from '../lib/api'
import { playComplete } from '../lib/sounds'
import { stopSpeaking } from '../lib/speech'

type Stage = 'loading' | 'intro' | 'play' | 'saving' | 'summary' | 'limit' | 'error'

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export default function Lesson() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [stage, setStage] = useState<Stage>('loading')
  const [lesson, setLesson] = useState<LessonData | null>(null)
  const [result, setResult] = useState<LessonResult | null>(null)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    api<{ lesson: LessonData }>(`/lessons/${id}?tz=${encodeURIComponent(timezone())}`)
      .then(({ lesson }) => {
        setLesson(lesson)
        setStage('intro')
      })
      .catch((err) => setStage(err instanceof ApiError && err.code === 'daily_limit' ? 'limit' : 'error'))
    return stopSpeaking
  }, [id])

  const leave = () => navigate('/', { replace: true })

  async function finish(play: PlayResult) {
    if (!lesson) return
    setStage('saving')
    setSeconds(play.seconds)
    try {
      const saved = await api<LessonResult>(`/lessons/${lesson.id}/complete`, {
        missed: play.missed,
        correctFirstTry: lesson.exercises.length - play.missed.length,
        seconds: play.seconds,
        tz: timezone(),
      })
      setResult(saved)
      playComplete()
      setStage('summary')
      void refresh()
    } catch (err) {
      setStage(err instanceof ApiError && err.code === 'daily_limit' ? 'limit' : 'error')
    }
  }

  if (stage === 'loading' || stage === 'saving') {
    return (
      <div className="flex h-full items-center justify-center">
        <Chai size={120} />
      </div>
    )
  }

  if (stage === 'limit' || stage === 'error' || !lesson) {
    return (
      <div className="safe-screen mx-auto flex h-full max-w-md flex-col items-center justify-center gap-5 text-center">
        <Chai size={140} />
        <div>
          <h1 className="text-3xl font-extrabold">{t(stage === 'limit' ? 'lesson.limitTitle' : 'lesson.errorTitle')}</h1>
          <p className="mt-2 text-lg text-ink/65">{t(stage === 'limit' ? 'lesson.limitText' : 'lesson.errorText')}</p>
        </div>
        <Button onClick={leave}>{t('lesson.backToCourse')}</Button>
      </div>
    )
  }

  if (stage === 'intro') return <LessonIntro lesson={lesson} onStart={() => setStage('play')} onClose={leave} />
  if (stage === 'summary' && result) return <LessonSummary result={result} seconds={seconds} onContinue={leave} />

  return (
    <ExercisePlayer
      exercises={lesson.exercises}
      onFinish={finish}
      onExit={leave}
      exitTitle={t('lesson.exitTitle')}
      exitText={t('lesson.exitText')}
    />
  )
}
