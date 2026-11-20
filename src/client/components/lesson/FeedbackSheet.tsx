import { useTranslation } from 'react-i18next'
import SpeakButton from './SpeakButton'

export interface Feedback {
  correct: boolean
  /** The right answer, shown when the student was wrong. */
  answer?: string
  explanation?: string
  /** English text to read aloud (the full correct sentence). */
  speakText?: string
}

interface Props {
  feedback: Feedback
  onContinue: () => void
}

/** Slides up after every answer: right or wrong, the correct answer, and why. */
export default function FeedbackSheet({ feedback, onContinue }: Props) {
  const { t } = useTranslation()
  const { correct } = feedback
  const tone = correct ? 'bg-good-soft text-good-ink' : 'bg-bad-soft text-bad-ink'
  const button = correct
    ? 'bg-mint shadow-[0_5px_0_0_var(--color-mint-dark)] active:shadow-[0_1px_0_0_var(--color-mint-dark)]'
    : 'bg-bad shadow-[0_5px_0_0_var(--color-bad-dark)] active:shadow-[0_1px_0_0_var(--color-bad-dark)]'

  return (
    <div className={`sheet-up safe-bottom -mx-5 rounded-t-3xl px-5 pt-5 ${tone}`} role="status">
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-xl font-extrabold" aria-hidden="true">
            {correct ? '✓' : '✕'}
          </span>
          <h3 className="flex-1 text-2xl font-extrabold">{correct ? t('lesson.correct') : t('lesson.wrong')}</h3>
          {feedback.speakText && <SpeakButton text={feedback.speakText} className="!bg-card/70 !text-current" />}
        </div>

        {!correct && feedback.answer && (
          <p className="select-text text-base">
            <span className="font-bold">{t('lesson.correctAnswer')}</span>{' '}
            <span className="font-extrabold">{feedback.answer}</span>
          </p>
        )}
        {feedback.explanation && <p className="select-text text-base leading-snug">{feedback.explanation}</p>}

        <button
          type="button"
          onClick={onContinue}
          className={`mt-1 min-h-14 w-full rounded-2xl text-lg font-extrabold text-white active:translate-y-1 ${button}`}
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  )
}
