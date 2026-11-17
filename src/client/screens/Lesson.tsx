import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { normalizeAnswer, toTiles, type Exercise, type Lesson as LessonData } from '../../shared/lesson'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import { FlameIcon } from '../components/icons'
import FeedbackSheet, { type Feedback } from '../components/lesson/FeedbackSheet'
import LessonIntro from '../components/lesson/LessonIntro'
import LessonSummary, { type LessonResult } from '../components/lesson/LessonSummary'
import MatchExercise from '../components/lesson/MatchExercise'
import OptionsExercise from '../components/lesson/OptionsExercise'
import TranslateExercise from '../components/lesson/TranslateExercise'
import Button from '../components/ui/Button'
import ProgressBar from '../components/ui/ProgressBar'
import { api, ApiError } from '../lib/api'
import { shuffle } from '../lib/shuffle'
import { playComplete, playCorrect, playWrong } from '../lib/sounds'
import { stopSpeaking } from '../lib/speech'

type Stage = 'loading' | 'intro' | 'play' | 'saving' | 'summary' | 'limit' | 'error'

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** The English text to read aloud once an exercise is answered. */
function spokenAnswer(e: Exercise): string | undefined {
  if (e.type === 'gap') return e.sentence.replace('___', e.options[e.answer])
  if (e.type === 'translate') return e.answer
  if (e.type === 'listen') return e.audio
  return undefined
}

export default function Lesson() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [stage, setStage] = useState<Stage>('loading')
  const [lesson, setLesson] = useState<LessonData | null>(null)
  /** Exercise positions still to do. A wrong answer is added to the end once, to try again. */
  const [queue, setQueue] = useState<number[]>([])
  const [position, setPosition] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [placed, setPlaced] = useState<number[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [combo, setCombo] = useState(0)
  const [confirmExit, setConfirmExit] = useState(false)
  const [result, setResult] = useState<LessonResult | null>(null)
  const [seconds, setSeconds] = useState(0)

  const missed = useRef(new Set<number>())
  const startedAt = useRef(0)

  useEffect(() => {
    api<{ lesson: LessonData }>(`/lessons/${id}?tz=${encodeURIComponent(timezone())}`)
      .then(({ lesson }) => {
        setLesson(lesson)
        setQueue(lesson.exercises.map((_, i) => i))
        setStage('intro')
      })
      .catch((err) => setStage(err instanceof ApiError && err.code === 'daily_limit' ? 'limit' : 'error'))
    return stopSpeaking
  }, [id])

  const exerciseIndex = queue[position]
  const exercise = lesson?.exercises[exerciseIndex]

  // Shuffled once per appearance of an exercise, so a retry shows a new order.
  const options = useMemo(
    () => (exercise && 'options' in exercise ? shuffle(exercise.options) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson, position],
  )
  const tiles = useMemo(
    () => (exercise?.type === 'translate' ? shuffle([...toTiles(exercise.answer), ...exercise.distractors]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson, position],
  )

  const leave = () => navigate('/', { replace: true })

  function start() {
    startedAt.current = Date.now()
    setStage('play')
  }

  function record(correct: boolean, details: Omit<Feedback, 'correct'>) {
    if (correct) {
      playCorrect()
      setCombo(combo + 1)
    } else {
      playWrong()
      setCombo(0)
      if (!missed.current.has(exerciseIndex)) {
        missed.current.add(exerciseIndex)
        setQueue([...queue, exerciseIndex])
      }
    }
    setFeedback({ correct, ...details })
  }

  function check() {
    if (!exercise || exercise.type === 'match') return
    const explanation = exercise.explanation
    const speakText = spokenAnswer(exercise)
    if (exercise.type === 'translate') {
      const built = normalizeAnswer(placed.map((tile) => tiles[tile]).join(' '))
      const accepted = [exercise.answer, ...(exercise.accept ?? [])].map(normalizeAnswer)
      record(accepted.includes(built), { answer: exercise.answer, explanation, speakText })
    } else {
      const right = exercise.options[exercise.answer]
      record(selected === right, { answer: right, explanation, speakText })
    }
  }

  function matchDone(mistakes: number) {
    if (mistakes > 0) missed.current.add(exerciseIndex)
    setCombo(mistakes > 0 ? 0 : combo + 1)
    setFeedback({ correct: true })
  }

  async function next() {
    setFeedback(null)
    setSelected(null)
    setPlaced([])
    if (position + 1 < queue.length) {
      setPosition(position + 1)
      return
    }
    if (!lesson) return
    setStage('saving')
    const elapsed = Math.round((Date.now() - startedAt.current) / 1000)
    setSeconds(elapsed)
    try {
      const saved = await api<LessonResult>(`/lessons/${lesson.id}/complete`, {
        correctFirstTry: lesson.exercises.length - missed.current.size,
        seconds: elapsed,
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

  if (stage === 'intro') return <LessonIntro lesson={lesson} onStart={start} onClose={leave} />
  if (stage === 'summary' && result) return <LessonSummary result={result} seconds={seconds} onContinue={leave} />
  if (!exercise) return null

  const canCheck = exercise.type === 'translate' ? placed.length > 0 : selected !== null

  return (
    <div className="safe-top mx-auto flex h-full max-w-md flex-col px-5">
      <header className="flex items-center gap-3 pb-4">
        <button
          type="button"
          onClick={() => setConfirmExit(true)}
          aria-label={t('lesson.close')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-ink/45 active:bg-ink/10"
        >
          ✕
        </button>
        <ProgressBar value={position / queue.length} />
        <span
          className={`flex w-12 shrink-0 items-center justify-end gap-0.5 text-base font-extrabold text-coral transition-opacity ${combo >= 2 ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={combo < 2}
        >
          <FlameIcon width={20} height={20} />
          {combo}
        </span>
      </header>

      {/* key restarts the entrance animation and the exercise's own state for every step */}
      <main key={position} className="slide-in flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <p className="text-sm font-extrabold uppercase tracking-wide text-ink/45">{t(`lesson.types.${exercise.type}`)}</p>
        {exercise.type === 'match' ? (
          <MatchExercise exercise={exercise} onDone={matchDone} />
        ) : exercise.type === 'translate' ? (
          <TranslateExercise exercise={exercise} tiles={tiles} placed={placed} onChange={setPlaced} checked={feedback !== null} />
        ) : (
          <OptionsExercise exercise={exercise} options={options} selected={selected} onSelect={setSelected} checked={feedback !== null} />
        )}
      </main>

      {feedback ? (
        <FeedbackSheet feedback={feedback} onContinue={next} />
      ) : (
        exercise.type !== 'match' && (
          <footer className="safe-bottom pt-2">
            <Button onClick={check} disabled={!canCheck}>
              {t('lesson.check')}
            </Button>
          </footer>
        )
      )}

      {confirmExit && (
        <div className="fixed inset-0 z-10 flex items-end bg-ink/40" onClick={() => setConfirmExit(false)}>
          <div className="sheet-up safe-bottom w-full rounded-t-3xl bg-cream px-5 pt-6" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto flex max-w-md flex-col gap-3">
              <h3 className="text-2xl font-extrabold">{t('lesson.exitTitle')}</h3>
              <p className="text-base text-ink/65">{t('lesson.exitText')}</p>
              <Button onClick={() => setConfirmExit(false)}>{t('lesson.keepGoing')}</Button>
              <Button variant="ghost" onClick={leave}>
                {t('lesson.exit')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
