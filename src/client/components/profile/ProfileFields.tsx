import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GENDERS, GOALS, INTERESTS, LIMITS, type Gender, type Profile } from '../../../shared/profile'
import { squarePhoto } from '../../lib/image'
import Avatar from '../Avatar'

/* The pieces of the profile form. The step after signing up and the "edit profile" screen are both built from them. */

export const fieldClass =
  'min-h-14 w-full select-text rounded-2xl border-2 border-ink/10 bg-white px-4 text-lg font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink/30 focus:border-coral'

export type Draft = Profile & { ageText: string }

export const toDraft = (profile: Profile): Draft => ({ ...profile, ageText: profile.age === null ? '' : String(profile.age) })
export const fromDraft = ({ ageText, ...profile }: Draft) => ({ ...profile, age: ageText ? Number(ageText) : null })

interface PhotoProps {
  userId: string
  name: string | null
  photoVersion: number | null
  /** A picture just chosen (a data address), or null. */
  preview: string | null
  onPick: (image: string) => void
  onRemove?: () => void
  size?: number
}

/** The avatar with a "choose a photo" button. The photo is cut to a small square on the phone. */
export function PhotoPicker({ userId, name, photoVersion, preview, onPick, onRemove, size = 120 }: PhotoProps) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [failed, setFailed] = useState(false)

  async function choose(file: File | undefined) {
    if (!file) return
    setFailed(false)
    try {
      onPick(await squarePhoto(file))
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => input.current?.click()} className="relative rounded-full active:scale-95" aria-label={t('profile.photoChoose')}>
        <Avatar userId={userId} name={name} photoVersion={photoVersion} preview={preview} size={size} className="ring-4 ring-white" />
        <span className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-coral text-xl text-white shadow-[0_3px_0_0_var(--color-coral-dark)]" aria-hidden="true">
          📷
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
      <div className="flex gap-4 text-sm font-extrabold">
        <button type="button" onClick={() => input.current?.click()} className="min-h-9 text-coral-dark underline">
          {t(preview || photoVersion ? 'profile.photoChange' : 'profile.photoChoose')}
        </button>
        {onRemove && (preview || photoVersion) && (
          <button type="button" onClick={onRemove} className="min-h-9 text-ink/50 underline">
            {t('profile.photoRemove')}
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className="text-sm font-bold text-coral-dark">
          {t('profile.photoFailed')}
        </p>
      )}
    </div>
  )
}

interface ChipsProps<T extends string> {
  options: readonly { id: T; icon: string }[]
  /** Where the names are in the translation files: "goals" or "interests". */
  names: string
  value: T[]
  max: number
  onChange: (value: T[]) => void
  /** Big two-column cards (the sign-up step) or small chips (the edit screen). */
  big?: boolean
}

/** Pick a few from a list. Tapping a chosen one removes it; at the limit the others go quiet. */
export function Chips<T extends string>({ options, names, value, max, onChange, big = false }: ChipsProps<T>) {
  const { t } = useTranslation()
  return (
    <div className={big ? 'grid grid-cols-2 gap-2.5' : 'flex flex-wrap gap-2'}>
      {options.map((option) => {
        const on = value.includes(option.id)
        const full = !on && value.length >= max
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            disabled={full}
            onClick={() => onChange(on ? value.filter((v) => v !== option.id) : [...value, option.id])}
            className={`flex items-center gap-2 rounded-2xl border-2 text-left font-extrabold leading-tight transition-colors active:translate-y-0.5 disabled:opacity-40 ${
              big ? 'min-h-16 px-3 py-2 text-base' : 'min-h-11 px-3 py-1.5 text-sm'
            } ${on ? 'border-coral bg-coral/10 text-coral-dark' : 'border-ink/10 bg-white text-ink'}`}
          >
            <span className={big ? 'text-2xl' : 'text-lg'} aria-hidden="true">
              {option.icon}
            </span>
            {t(`${names}.${option.id}` as string)}
          </button>
        )
      })}
    </div>
  )
}

export const GoalChips = (props: Omit<ChipsProps<Profile['goals'][number]>, 'options' | 'names' | 'max'>) => <Chips options={GOALS} names="goals" max={LIMITS.goals} {...props} />
export const InterestChips = (props: Omit<ChipsProps<Profile['interests'][number]>, 'options' | 'names' | 'max'>) => (
  <Chips options={INTERESTS} names="interests" max={LIMITS.interests} {...props} />
)

/** Age and gender on one line. Both optional. */
export function AgeAndGender({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-extrabold uppercase tracking-wide text-ink/50">{t('profile.age')}</span>
        <input
          className={`${fieldClass} w-32`}
          inputMode="numeric"
          maxLength={3}
          placeholder="—"
          value={draft.ageText}
          onChange={(e) => onChange({ ...draft, ageText: e.target.value.replace(/\D/g, '').slice(0, 3) })}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-extrabold uppercase tracking-wide text-ink/50">{t('profile.gender')}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('profile.gender')}>
          {GENDERS.map((gender: Gender) => {
            const on = draft.gender === gender
            return (
              <button
                key={gender}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ ...draft, gender: on ? null : gender })}
                className={`min-h-12 rounded-2xl border-2 px-4 text-base font-extrabold active:translate-y-0.5 ${on ? 'border-coral bg-coral/10 text-coral-dark' : 'border-ink/10 bg-white text-ink'}`}
              >
                {t(`genders.${gender}`)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
