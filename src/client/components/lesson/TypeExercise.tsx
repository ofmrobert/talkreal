import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { DictationExercise, TypeExercise as TypeData } from '../../../shared/lesson'
import { canSpeak, speak } from '../../lib/speech'
import Chai from '../Chai'
import SpeakButton from './SpeakButton'

interface Props {
  exercise: TypeData | DictationExercise
  value: string
  onChange: (value: string) => void
  /** Called when the student presses Enter. */
  onSubmit: () => void
  checked: boolean
}

/** The two keyboard exercises: write the translation, or write down what you hear. */
export default function TypeExercise({ exercise, value, onChange, onSubmit, checked }: Props) {
  const { t } = useTranslation()

  // A dictation reads itself aloud as soon as it appears.
  useEffect(() => {
    if (exercise.type === 'dictation') speak(exercise.audio)
  }, [exercise])

  return (
    <div className="flex flex-1 flex-col gap-5">
      {exercise.type === 'type' ? (
        <div className="flex items-center gap-2">
          <Chai size={72} />
          <p className="select-text rounded-3xl rounded-bl-md bg-white px-4 py-3 text-lg font-bold shadow-[0_4px_0_0_rgba(31,27,58,0.07)]">
            {exercise.source}
          </p>
        </div>
      ) : canSpeak() ? (
        <div className="flex items-end justify-center gap-3">
          <SpeakButton text={exercise.audio} size="big" />
          <SpeakButton text={exercise.audio} slow className="h-14 w-14 rounded-2xl" />
        </div>
      ) : (
        // No voice on this device: the student copies the sentence, which is still writing practice.
        <p className="select-text rounded-2xl bg-white p-4 text-xl font-bold">{exercise.audio}</p>
      )}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (value.trim()) onSubmit()
          }
        }}
        readOnly={checked}
        rows={3}
        lang="en"
        autoCapitalize="sentences"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder={t('lesson.typeHere')}
        aria-label={t(`lesson.types.${exercise.type}`)}
        className="w-full select-text resize-none rounded-2xl border-2 border-ink/10 bg-white p-4 text-xl font-bold outline-none placeholder:font-semibold placeholder:text-ink/30 focus:border-coral"
      />
    </div>
  )
}
