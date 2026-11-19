import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Exercise } from '../../shared/lesson'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import ExercisePlayer, { type PlayResult } from '../components/lesson/ExercisePlayer'
import LessonSummary, { type LessonResult } from '../components/lesson/LessonSummary'
import Button from '../components/ui/Button'
import { api } from '../lib/api'
import { playComplete } from '../lib/sounds'

interface ReviewItem {
  id: string
  exercise: Exercise
}

type Stage = 'loading' | 'play' | 'saving' | 'summary' | 'empty' | 'error'

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** A short session of words and missed exercises that are due to be repeated today. */
export default function Review() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [stage, setStage] = useState<Stage>('loading')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [result, setResult] = useState<(LessonResult & { due: number }) | null>(null)
  const [seconds, setSeconds] = useState(0)
  /** Goes up for every new round, so the player starts afresh. */
  const [round, setRound] = useState(0)

  function load() {
    setStage('loading')
    api<{ items: ReviewItem[] }>(`/review?tz=${encodeURIComponent(timezone())}`)
      .then(({ items }) => {
        setItems(items)
        setRound((r) => r + 1)
        setStage(items.length > 0 ? 'play' : 'empty')
      })
      .catch(() => setStage('error'))
  }

  useEffect(load, [])

  const leave = () => navigate('/', { replace: true })

  async function finish(play: PlayResult) {
    setStage('saving')
    setSeconds(play.seconds)
    try {
      const saved = await api<LessonResult & { due: number }>('/review/complete', {
        results: items.map((item, index) => ({ id: item.id, correct: !play.missed.includes(index) })),
        seconds: play.seconds,
        tz: timezone(),
      })
      setResult(saved)
      playComplete()
      setStage('summary')
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

  if (stage === 'empty' || stage === 'error') {
    return (
      <div className="safe-screen mx-auto flex h-full max-w-md flex-col items-center justify-center gap-5 text-center">
        <Chai size={140} />
        <div>
          <h1 className="text-3xl font-extrabold">{t(stage === 'empty' ? 'review.emptyTitle' : 'lesson.errorTitle')}</h1>
          <p className="mt-2 text-lg text-ink/65">{t(stage === 'empty' ? 'review.emptyText' : 'lesson.errorText')}</p>
        </div>
        <Button onClick={leave}>{t('lesson.backToCourse')}</Button>
      </div>
    )
  }

  if (stage === 'summary' && result) {
    return (
      <LessonSummary
        result={result}
        seconds={seconds}
        onContinue={leave}
        title={t('review.doneTitle')}
        extraAction={result.due > 0 ? { label: t('review.more', { count: result.due }), onClick: load } : undefined}
      />
    )
  }

  return (
    <ExercisePlayer
      key={round}
      exercises={items.map((item) => item.exercise)}
      onFinish={finish}
      onExit={leave}
      exitTitle={t('review.exitTitle')}
      exitText={t('review.exitText')}
    />
  )
}
