import type { TranslateExercise as TranslateData } from '../../../shared/lesson'
import Chai from '../Chai'

interface Props {
  exercise: TranslateData
  /** All word tiles in the (shuffled) order of the word bank. */
  tiles: string[]
  /** Positions of the tiles the student has placed, in sentence order. */
  placed: number[]
  onChange: (placed: number[]) => void
  checked: boolean
}

const tileClass =
  'min-h-12 rounded-xl border-2 border-ink/10 bg-card px-3.5 text-lg font-bold shadow-[0_3px_0_0_rgb(var(--shade)/0.1)] active:translate-y-0.5 active:shadow-none'

/** Build the English sentence by tapping word tiles. Tap a placed word to put it back. */
export default function TranslateExercise({ exercise, tiles, placed, onChange, checked }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center gap-2">
        <Chai size={72} />
        <p className="select-text rounded-3xl rounded-bl-md bg-card px-4 py-3 text-lg font-bold shadow-[0_4px_0_0_rgb(var(--shade)/0.07)]">
          {exercise.source}
        </p>
      </div>

      {/* The sentence being built */}
      <div className="flex min-h-[7.500rem] flex-wrap content-start gap-2 border-y-2 border-ink/10 py-3">
        {placed.map((tile) => (
          <button
            key={tile}
            type="button"
            disabled={checked}
            onClick={() => onChange(placed.filter((p) => p !== tile))}
            className={tileClass}
          >
            {tiles[tile]}
          </button>
        ))}
      </div>

      {/* The word bank: a used tile leaves an empty slot so the others don't jump around */}
      <div className="mt-auto flex flex-wrap justify-center gap-2">
        {tiles.map((word, tile) => {
          const used = placed.includes(tile)
          return (
            <button
              key={tile}
              type="button"
              disabled={used || checked}
              onClick={() => onChange([...placed, tile])}
              className={used ? 'min-h-12 rounded-xl bg-ink/10 px-3.5 text-lg font-bold text-transparent' : tileClass}
            >
              {word}
            </button>
          )
        })}
      </div>
    </div>
  )
}
