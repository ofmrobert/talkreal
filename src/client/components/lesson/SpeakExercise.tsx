import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchSpeech, type SpeakExercise as SpeakData } from '../../../shared/lesson'
import { listenOnce, type ListenProblem } from '../../lib/recognition'
import { stopSpeaking } from '../../lib/speech'
import { MicIcon } from '../icons'
import SpeakButton from './SpeakButton'

/** The student may try this many times before the exercise counts as missed. */
const MAX_TRIES = 3

interface Props {
  exercise: SpeakData
  /** Called once: the sentence was said well enough, or the tries ran out. */
  onDone: (correct: boolean) => void
  /** The student cannot speak right now: leave out the speaking exercises. */
  onSkip: () => void
  checked: boolean
}

/** Say the sentence aloud. The words that were heard turn green. */
export default function SpeakExercise({ exercise, onDone, onSkip, checked }: Props) {
  const { t } = useTranslation()
  const [listening, setListening] = useState(false)
  const [tries, setTries] = useState(0)
  const [words, setWords] = useState(() => matchSpeech(exercise.text, []).words)
  const [problem, setProblem] = useState<ListenProblem | null>(null)
  const stop = useRef<(() => void) | null>(null)

  useEffect(() => () => stop.current?.(), [])

  function listen() {
    stopSpeaking()
    setProblem(null)
    setListening(true)
    stop.current = listenOnce({
      onHeard: (alternatives) => {
        setListening(false)
        const result = matchSpeech(exercise.text, alternatives)
        setWords(result.words)
        if (result.passed) onDone(true)
        else if (tries + 1 >= MAX_TRIES) onDone(false)
        else setTries(tries + 1)
      },
      onProblem: (kind) => {
        setListening(false)
        setProblem(kind)
      },
    })
  }

  function toggle() {
    if (listening) {
      stop.current?.()
      setListening(false)
    } else listen()
  }

  const hint = problem
    ? t(`lesson.speak.${problem}`)
    : listening
      ? t('lesson.speak.listening')
      : tries > 0
        ? t('lesson.speak.again', { count: MAX_TRIES - tries })
        : t('lesson.speak.tap')

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_rgba(31,27,58,0.07)]">
        <div className="flex items-start gap-3">
          <p className="flex-1 select-text text-2xl font-extrabold leading-snug">
            {words.map((w, i) => (
              <span key={i} className={w.heard ? 'text-[#0E8A6C]' : tries > 0 || checked ? 'text-coral-dark' : ''}>
                {w.word}{' '}
              </span>
            ))}
          </p>
          <SpeakButton text={exercise.text} />
        </div>
        <p className="mt-2 text-base text-ink/55">{exercise.translation}</p>
      </div>

      {!checked && (
        <div className="mt-auto flex flex-col items-center gap-4 pb-2">
          <p className={`text-center text-base font-bold ${problem ? 'text-coral-dark' : 'text-ink/60'}`} role="status">
            {hint}
          </p>
          <button
            type="button"
            onClick={toggle}
            aria-label={t(listening ? 'lesson.speak.stop' : 'lesson.speak.start')}
            aria-pressed={listening}
            className={`flex h-24 w-24 items-center justify-center rounded-full text-white active:translate-y-1 ${
              listening
                ? 'pulse-soft bg-coral-dark'
                : 'bg-coral shadow-[0_6px_0_0_var(--color-coral-dark)] active:shadow-[0_2px_0_0_var(--color-coral-dark)]'
            }`}
          >
            <MicIcon width={44} height={44} />
          </button>
          <button type="button" onClick={onSkip} className="min-h-11 text-base font-bold text-ink/50 underline">
            {t('lesson.speak.skip')}
          </button>
        </div>
      )}
    </div>
  )
}
