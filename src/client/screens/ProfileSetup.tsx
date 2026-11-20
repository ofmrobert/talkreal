import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LIMITS, type Profile } from '../../shared/profile'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import { AgeAndGender, fieldClass, fromDraft, GoalChips, InterestChips, PhotoPicker, toDraft, type Draft } from '../components/profile/ProfileFields'
import Button from '../components/ui/Button'
import ProgressBar from '../components/ui/ProgressBar'
import { api } from '../lib/api'

const EMPTY: Profile = { name: null, bio: null, city: null, age: null, gender: null, goals: [], interests: [], discoverable: false }
const STEPS = ['name', 'goals', 'about'] as const

/**
 * The "about you" step right after signing up: a name and photo, why the student is learning,
 * and a little about them. Three short screens; everything can be skipped.
 */
export default function ProfileSetup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(() => toDraft({ ...EMPTY, name: user?.displayName ?? null }))
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!user) return <Navigate to="/login" replace />
  // Someone who has already been through this step has nothing to do here.
  if (user.profileSet && !busy) return <Navigate to="/" replace />

  /** Saves what was filled in (or nothing, when everything is skipped) and moves on to the app. */
  async function finish(skipAll: boolean) {
    setBusy(true)
    setFailed(false)
    try {
      if (!skipAll && photo) await api('/profile/photo', { image: photo })
      await api('/profile', skipAll ? { skip: true } : fromDraft(draft))
      await refresh()
      navigate('/', { replace: true })
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  const last = step === STEPS.length - 1
  const next = () => (last ? void finish(false) : setStep(step + 1))
  const name = draft.name ?? ''

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-4">
      <header className="flex items-center gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            aria-label={t('placement.back')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-ink/55 active:bg-ink/10"
          >
            ←
          </button>
        ) : (
          <span className="h-11 w-11 shrink-0" />
        )}
        <ProgressBar value={(step + 1) / STEPS.length} />
        <button type="button" onClick={() => finish(true)} disabled={busy} className="min-h-11 shrink-0 px-1 text-base font-bold text-ink/50">
          {t('common.skip')}
        </button>
      </header>

      <main key={step} className="slide-in flex flex-1 flex-col gap-5 overflow-y-auto pb-2">
        {STEPS[step] === 'name' && (
          <>
            <div className="text-center">
              <h1 className="text-3xl font-extrabold leading-tight">{t('setup.nameTitle')}</h1>
              <p className="mt-2 text-lg text-ink/65">{t('setup.nameText')}</p>
            </div>
            <PhotoPicker userId={user.id} name={name} photoVersion={null} preview={photo} onPick={setPhoto} onRemove={() => setPhoto(null)} />
            <input
              className={`${fieldClass} text-center`}
              placeholder={t('profile.namePlaceholder')}
              aria-label={t('profile.name')}
              autoComplete="given-name"
              autoCapitalize="words"
              maxLength={LIMITS.name}
              value={name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </>
        )}

        {STEPS[step] === 'goals' && (
          <>
            <div className="flex items-center gap-2">
              <Chai size={84} />
              <div>
                <h1 className="text-2xl font-extrabold leading-tight">{t('setup.goalsTitle', { name: name.trim() || t('setup.friend') })}</h1>
                <p className="mt-1 text-base text-ink/65">{t('setup.goalsText', { count: LIMITS.goals })}</p>
              </div>
            </div>
            <GoalChips big value={draft.goals} onChange={(goals) => setDraft({ ...draft, goals })} />
          </>
        )}

        {STEPS[step] === 'about' && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold leading-tight">{t('setup.aboutTitle')}</h1>
              <p className="mt-1 text-base text-ink/65">{t('setup.aboutText')}</p>
            </div>
            <AgeAndGender draft={draft} onChange={setDraft} />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-extrabold uppercase tracking-wide text-ink/50">{t('profile.interests')}</span>
              <InterestChips value={draft.interests} onChange={(interests) => setDraft({ ...draft, interests })} />
            </div>
          </>
        )}

        {failed && (
          <p role="alert" className="rounded-2xl bg-coral/15 p-3 text-center text-base font-bold text-coral-dark">
            {t('profile.saveFailed')}
          </p>
        )}
      </main>

      <Button onClick={next} disabled={busy}>
        {last ? t('setup.finish') : t('common.next')}
      </Button>
    </div>
  )
}
