import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAccepted, toTiles, type Exercise } from '../../../shared/lesson'
import { canRecognize } from '../../lib/recognition'
import { shuffle } from '../../lib/shuffle'
import { playCorrect, playWrong } from '../../lib/sounds'
import { stopSpeaking } from '../../lib/speech'
import { FlameIcon } from '../icons'
import Button from '../ui/Button'
import ProgressBar from '../ui/ProgressBar'
import FeedbackSheet, { type Feedback } from './FeedbackSheet'
import MatchExercise from './MatchExercise'
import OptionsExercise from './OptionsExercise'
import SpeakExercise from './SpeakExercise'
import TranslateExercise from './TranslateExercise'
import TypeExercise from './TypeExercise'

export interface PlayResult {
  /** Positions (in `exercises`) of the exercises that were not right the first time. */
  missed: number[]
  seconds: number
}

interface Props {
  exercises: Exercise[]
  onFinish: (result: PlayResult) => void
  onExit: () => void
  /** Shown when the student tries to leave half-way. */
  exitTitle: string
  exitText: string
}

/** The English text to read aloud once an exercise is answered. */
function spokenAnswer(e: Exercise): string | undefined {
  if (e.type === 'gap') {
    // A 'no article' answer (written as a dash) is simply left out when read aloud.
    const word = e.options[e.answer].startsWith('—') ? '' : e.options[e.answer]
    return e.sentence.replace('___', word).replace(/\s+/g, ' ')
  }
  if (e.type === 'translate' || e.type === 'type') return e.answer
  if (e.type === 'listen' || e.type === 'dictation') return e.audio
  if (e.type === 'speak') return e.text
  return undefined
}

/**
 * Runs a list of exercises one by one: answer, feedback, next. A wrong answer comes back
 * once at the end. Used by lessons and by review sessions.
 */
export default function ExercisePlayer({ exercises, onFinish, onExit, exitTitle, exitText }: Props) {
  const { t } = useTranslation()
  /** Exercise positions still to do. Speaking is left out where the device cannot recognise speech. */
  const [queue, setQueue] = useState<number[]>(() =>
    exercises.map((_, i) => i).filter((i) => exercises[i].type !== 'speak' || canRecognize()),
  )
  const [position, setPosition] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [placed, setPlaced] = useState<number[]>([])
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [combo, setCombo] = useState(0)
  const [confirmExit, setConfirmExit] = useState(false)

  const missed = useRef(new Set<number>())
  const startedAt = useRef(Date.now())

  useEffect(() => stopSpeaking, [])

  const exerciseIndex = queue[position]
  const exercise: Exercise | undefined = exercises[exerciseIndex]

  // Shuffled once per appearance of an exercise, so a retry shows a new order.
  const options = useMemo(
    () => (exercise && 'options' in exercise ? shuffle(exercise.options) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, exerciseIndex],
  )
  const tiles = useMemo(
    () => (exercise?.type === 'translate' ? shuffle([...toTiles(exercise.answer), ...exercise.distractors]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, exerciseIndex],
  )

  function finish() {
    onFinish({ missed: [...missed.current], seconds: Math.round((Date.now() - startedAt.current) / 1000) })
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
    if (!exercise || feedback) return
    const speakText = spokenAnswer(exercise)
    switch (exercise.type) {
      case 'translate': {
        const built = placed.map((tile) => tiles[tile]).join(' ')
        record(isAccepted(built, exercise), { answer: exercise.answer, explanation: exercise.explanation, speakText })
        break
      }
      case 'type':
        record(isAccepted(typed, exercise), { answer: exercise.answer, explanation: exercise.explanation, speakText })
        break
      case 'dictation': {
        const explanation = [exercise.translation, exercise.explanation].filter(Boolean).join(' ')
        record(isAccepted(typed, { answer: exercise.audio }), { answer: exercise.audio, explanation, speakText })
        break
      }
      case 'choice':
      case 'gap':
      case 'listen': {
        const right = exercise.options[exercise.answer]
        record(selected === right, { answer: right, explanation: exercise.explanation, speakText })
        break
      }
    }
  }

  function matchDone(mistakes: number) {
    if (mistakes > 0) missed.current.add(exerciseIndex)
    setCombo(mistakes > 0 ? 0 : combo + 1)
    setFeedback({ correct: true })
  }

  function spoken(correct: boolean) {
    if (exercise?.type !== 'speak') return
    record(correct, {
      explanation: correct ? exercise.explanation : (exercise.explanation ?? t('lesson.speak.missed')),
      speakText: exercise.text,
    })
  }

  /** Drops this and every later speaking exercise: the student cannot talk right now. */
  function skipSpeaking() {
    const rest = queue.filter((index, at) => at < position || exercises[index].type !== 'speak')
    if (position >= rest.length) finish()
    else setQueue(rest)
  }

  function next() {
    setFeedback(null)
    setSelected(null)
    setPlaced([])
    setTyped('')
    if (position + 1 < queue.length) setPosition(position + 1)
    else finish()
  }

  if (!exercise) return null

  const selfChecking = exercise.type === 'match' || exercise.type === 'speak'
  const canCheck =
    exercise.type === 'translate'
      ? placed.length > 0
      : exercise.type === 'type' || exercise.type === 'dictation'
        ? typed.trim().length > 0
        : selected !== null

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
      <main key={`${position}-${exerciseIndex}`} className="slide-in flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <p className="text-sm font-extrabold uppercase tracking-wide text-ink/45">{t(`lesson.types.${exercise.type}`)}</p>
        {exercise.type === 'match' ? (
          <MatchExercise exercise={exercise} onDone={matchDone} />
        ) : exercise.type === 'speak' ? (
          <SpeakExercise exercise={exercise} onDone={spoken} onSkip={skipSpeaking} checked={feedback !== null} />
        ) : exercise.type === 'translate' ? (
          <TranslateExercise exercise={exercise} tiles={tiles} placed={placed} onChange={setPlaced} checked={feedback !== null} />
        ) : exercise.type === 'type' || exercise.type === 'dictation' ? (
          <TypeExercise exercise={exercise} value={typed} onChange={setTyped} onSubmit={check} checked={feedback !== null} />
        ) : (
          <OptionsExercise exercise={exercise} options={options} selected={selected} onSelect={setSelected} checked={feedback !== null} />
        )}
      </main>

      {feedback ? (
        <FeedbackSheet feedback={feedback} onContinue={next} />
      ) : (
        !selfChecking && (
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
              <h3 className="text-2xl font-extrabold">{exitTitle}</h3>
              <p className="text-base text-ink/65">{exitText}</p>
              <Button onClick={() => setConfirmExit(false)}>{t('lesson.keepGoing')}</Button>
              <Button variant="ghost" onClick={onExit}>
                {t('lesson.exit')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
