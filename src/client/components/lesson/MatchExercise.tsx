import { useMemo, useState } from 'react'
import type { MatchExercise as MatchData } from '../../../shared/lesson'
import { playCorrect, playWrong } from '../../lib/sounds'
import { speak } from '../../lib/speech'
import { shuffle } from '../../lib/shuffle'

interface Props {
  exercise: MatchData
  /** Called when every pair is connected, with the number of wrong attempts. */
  onDone: (mistakes: number) => void
}

/** Tap an English word, then its Russian meaning. */
export default function MatchExercise({ exercise, onDone }: Props) {
  const left = useMemo(() => shuffle(exercise.pairs.map((p) => p.en)), [exercise])
  const right = useMemo(() => shuffle(exercise.pairs.map((p) => p.ru)), [exercise])
  const [pickedEn, setPickedEn] = useState<string | null>(null)
  const [pickedRu, setPickedRu] = useState<string | null>(null)
  const [matched, setMatched] = useState<string[]>([])
  const [wrong, setWrong] = useState<[string, string] | null>(null)
  const [mistakes, setMistakes] = useState(0)

  function tryPair(en: string, ru: string) {
    const isPair = exercise.pairs.some((p) => p.en === en && p.ru === ru)
    if (isPair) {
      playCorrect()
      const next = [...matched, en]
      setMatched(next)
      setPickedEn(null)
      setPickedRu(null)
      if (next.length === exercise.pairs.length) setTimeout(() => onDone(mistakes), 450)
    } else {
      playWrong()
      setMistakes(mistakes + 1)
      setWrong([en, ru])
      setTimeout(() => {
        setWrong(null)
        setPickedEn(null)
        setPickedRu(null)
      }, 500)
    }
  }

  function pick(side: 'en' | 'ru', word: string) {
    if (wrong) return
    if (side === 'en') {
      speak(word)
      setPickedEn(word)
      if (pickedRu) tryPair(word, pickedRu)
    } else {
      setPickedRu(word)
      if (pickedEn) tryPair(pickedEn, word)
    }
  }

  const ruMatched = (ru: string) => matched.includes(exercise.pairs.find((p) => p.ru === ru)!.en)

  function look(done: boolean, picked: boolean, isWrong: boolean) {
    if (done) return 'border-mint bg-mint/15 text-ink/40'
    if (isWrong) return 'border-coral bg-coral/15 text-coral-dark shake'
    if (picked) return 'border-coral bg-coral/10 text-coral-dark shadow-[0_4px_0_0_var(--color-coral)]'
    return 'border-ink/10 bg-white shadow-[0_4px_0_0_rgba(31,27,58,0.08)]'
  }

  const cell = 'flex min-h-16 w-full items-center justify-center rounded-2xl border-2 px-2 py-2 text-center text-base font-bold leading-tight transition-colors'

  return (
    <div className="grid flex-1 grid-cols-2 content-center gap-3">
      <div className="flex flex-col gap-3">
        {left.map((en) => (
          <button
            key={en}
            type="button"
            disabled={matched.includes(en)}
            onClick={() => pick('en', en)}
            className={`${cell} ${look(matched.includes(en), pickedEn === en, wrong?.[0] === en)}`}
          >
            {en}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {right.map((ru) => (
          <button
            key={ru}
            type="button"
            disabled={ruMatched(ru)}
            onClick={() => pick('ru', ru)}
            className={`${cell} ${look(ruMatched(ru), pickedRu === ru, wrong?.[1] === ru)}`}
          >
            {ru}
          </button>
        ))}
      </div>
    </div>
  )
}
