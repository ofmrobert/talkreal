import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import Button from '../components/ui/Button'
import ProgressBar from '../components/ui/ProgressBar'
import { api } from '../lib/api'
import { LEVELS, type Level } from '../../shared/levels'

interface Question {
  id: string
  level: Level
  prompt: string
  options: string[]
}

type Outcome = { status: 'continue'; level: Level } | { status: 'done'; level: Level }
type Stage = 'intro' | 'self' | 'test' | 'result'

const optionClass =
  'min-h-14 w-full rounded-2xl border-2 border-ink/10 bg-white px-4 py-3 text-left text-lg font-bold shadow-[0_4px_0_0_rgba(31,27,58,0.08)] active:translate-y-1 active:shadow-none disabled:opacity-60'

/** Sets the student's level: either they pick it, or a short test finds it. */
export default function Placement() {
  const { t } = useTranslation()
  const { user, refresh } = useAuth()
  const navigate = useNavigate()

  const [stage, setStage] = useState<Stage>('intro')
  const [questions, setQuestions] = useState<Question[]>([])
  const [testLevel, setTestLevel] = useState<Level>('A1')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<Level | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const block = questions.filter((q) => q.level === testLevel)
  const question = block[index]

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(false)
    try {
      await action()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function finish(level: Level) {
    setResult(level)
    setStage('result')
    await refresh()
  }

  const startTest = () =>
    run(async () => {
      const res = await api<{ questions: Question[] }>('/placement/questions')
      setQuestions(res.questions)
      setAnswers({})
      setTestLevel('A1')
      setIndex(0)
      setStage('test')
    })

  const chooseLevel = (level: Level) =>
    run(async () => {
      await api('/placement/choose', { level })
      await finish(level)
    })

  function answer(choice: number) {
    const updated = { ...answers, [question.id]: choice }
    setAnswers(updated)
    if (index < block.length - 1) {
      setIndex(index + 1)
      return
    }
    // The level's block is complete: the server decides whether to go up a level or stop.
    run(async () => {
      const outcome = await api<Outcome>('/placement/submit', { answers: updated })
      if (outcome.status === 'done') {
        await finish(outcome.level)
      } else {
        setTestLevel(outcome.level)
        setIndex(0)
      }
    })
  }

  const errorNote = error && (
    <p role="alert" className="rounded-2xl bg-coral/15 p-3 text-center text-base font-bold text-coral-dark">
      {t('login.errors.server_error')}
    </p>
  )

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col">
      {stage === 'intro' && (
        <div className="slide-in flex flex-1 flex-col gap-5 overflow-y-auto pb-2 pt-6">
          <div className="flex justify-center">
            <Chai size={140} />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold leading-tight">{t('placement.title')}</h1>
            <p className="mt-2 text-lg text-ink/70">{t('placement.subtitle')}</p>
          </div>
          {errorNote}
          <div className="mt-auto flex flex-col gap-3">
            <Button onClick={startTest} disabled={busy}>
              {t('placement.takeTest')}
            </Button>
            <Button variant="secondary" onClick={() => setStage('self')} disabled={busy}>
              {t('placement.chooseMyself')}
            </Button>
            {user?.level && (
              <Button variant="ghost" onClick={() => navigate('/profile')}>
                {t('placement.keepLevel', { level: user.level })}
              </Button>
            )}
          </div>
        </div>
      )}

      {stage === 'self' && (
        <div className="slide-in flex flex-1 flex-col gap-3 overflow-y-auto pb-2 pt-4">
          <h1 className="text-3xl font-extrabold leading-tight">{t('placement.selfTitle')}</h1>
          {errorNote}
          {LEVELS.map((level) => (
            <button key={level} className={optionClass} disabled={busy} onClick={() => chooseLevel(level)}>
              <span className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-coral text-base font-extrabold text-white">
                  {level}
                </span>
                <span>
                  <span className="block">{t(`levels.${level}.name`)}</span>
                  <span className="block text-sm font-semibold text-ink/60">{t(`levels.${level}.hint`)}</span>
                </span>
              </span>
            </button>
          ))}
          <div className="mt-auto">
            <Button variant="ghost" onClick={() => setStage('intro')}>
              {t('placement.back')}
            </Button>
          </div>
        </div>
      )}

      {stage === 'test' && question && (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto pb-2 pt-2">
          <ProgressBar value={Object.keys(answers).length / questions.length} />
          {/* key restarts the entrance animation for every question */}
          <div key={question.id} className="slide-in flex flex-1 flex-col gap-5">
            <p className="text-base font-bold text-ink/55">{t('placement.instruction')}</p>
            <h2 className="select-text text-2xl font-extrabold leading-snug">{question.prompt}</h2>
            {errorNote}
            <div className="mt-auto flex flex-col gap-3">
              {question.options.map((option, i) => (
                <button key={option} className={optionClass} disabled={busy} onClick={() => answer(i)}>
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {stage === 'result' && result && (
        <div className="slide-in flex flex-1 flex-col items-center gap-5 overflow-y-auto pb-2 pt-6 text-center">
          <Chai size={140} />
          <p className="text-lg font-bold text-ink/60">{t('placement.resultLabel')}</p>
          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-coral text-5xl font-extrabold text-white shadow-[0_8px_0_0_var(--color-coral-dark)]">
            {result}
          </div>
          <div>
            <h1 className="text-3xl font-extrabold">{t(`levels.${result}.name`)}</h1>
            <p className="mt-2 text-lg text-ink/70">{t('placement.resultText')}</p>
          </div>
          <div className="mt-auto w-full">
            <Button onClick={() => navigate('/', { replace: true })}>{t('placement.startLearning')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
