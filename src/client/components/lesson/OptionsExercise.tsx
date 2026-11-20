import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChoiceExercise, GapExercise, ListenExercise } from '../../../shared/lesson'
import { canSpeak, speak } from '../../lib/speech'
import SpeakButton from './SpeakButton'

interface Props {
  exercise: ChoiceExercise | GapExercise | ListenExercise
  /** The options in the (shuffled) order to show them. */
  options: string[]
  selected: string | null
  onSelect: (option: string) => void
  /** Set once the answer has been checked: the options then show right and wrong. */
  checked: boolean
}

/** The three "pick one option" exercises: multiple choice, fill the blank, listen and pick. */
export default function OptionsExercise({ exercise, options, selected, onSelect, checked }: Props) {
  const { t } = useTranslation()
  const correct = exercise.options[exercise.answer]

  // A listening exercise reads itself aloud as soon as it appears.
  useEffect(() => {
    if (exercise.type === 'listen') speak(exercise.audio)
  }, [exercise])

  return (
    <div className="flex flex-1 flex-col gap-5">
      {exercise.type === 'choice' && (
        <h2 className="select-text text-2xl font-extrabold leading-snug">{exercise.prompt}</h2>
      )}

      {exercise.type === 'gap' && (
        <div>
          <h2 className="select-text text-2xl font-extrabold leading-relaxed">
            {exercise.sentence.split('___')[0]}
            <span
              className={`mx-1 inline-block min-w-20 rounded-xl border-b-4 px-2 text-center ${
                selected ? 'border-coral bg-coral/10 text-coral-ink' : 'border-ink/25 text-transparent'
              }`}
            >
              {/* An option like '— (без артикля)' goes into the sentence as a plain dash. */}
              {selected ? selected.replace(/\s*\(.*\)$/, '') : '____'}
            </span>
            {exercise.sentence.split('___')[1]}
          </h2>
          {exercise.translation && <p className="mt-2 text-base text-ink/55">{exercise.translation}</p>}
        </div>
      )}

      {exercise.type === 'listen' && (
        <div className="flex flex-col items-center gap-4">
          {canSpeak() ? (
            <div className="flex items-end gap-3">
              <SpeakButton text={exercise.audio} size="big" />
              <SpeakButton text={exercise.audio} slow className="h-14 w-14 rounded-2xl" />
            </div>
          ) : (
            // No voice on this device: show the sentence so the exercise still works.
            <p className="select-text rounded-2xl bg-card p-4 text-xl font-bold">{exercise.audio}</p>
          )}
          <h2 className="w-full text-xl font-extrabold leading-snug">{exercise.question}</h2>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3" role="radiogroup" aria-label={t(`lesson.types.${exercise.type}`)}>
        {options.map((option) => {
          const isSelected = selected === option
          let look = 'border-ink/10 bg-card text-ink shadow-[0_4px_0_0_rgb(var(--shade)/0.08)]'
          if (checked && option === correct) look = 'border-mint bg-mint/15 text-ink shadow-[0_4px_0_0_var(--color-mint)]'
          else if (checked && isSelected) look = 'border-bad bg-bad/10 text-bad-ink shadow-[0_4px_0_0_var(--color-bad)]'
          else if (isSelected) look = 'border-coral bg-coral/10 text-coral-ink shadow-[0_4px_0_0_var(--color-coral)]'
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={checked}
              onClick={() => onSelect(option)}
              className={`min-h-14 w-full rounded-2xl border-2 px-4 py-3 text-left text-lg font-bold transition-colors active:translate-y-0.5 ${look}`}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
