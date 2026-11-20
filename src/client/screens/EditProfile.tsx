import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LIMITS, type Profile } from '../../shared/profile'
import { useAuth } from '../auth/AuthContext'
import Chai from '../components/Chai'
import { AgeAndGender, fieldClass, fromDraft, GoalChips, InterestChips, PhotoPicker, toDraft, type Draft } from '../components/profile/ProfileFields'
import Button from '../components/ui/Button'
import { api } from '../lib/api'

const label = 'text-sm font-extrabold uppercase tracking-wide text-ink/50'

/** Edit everything in the profile on one screen. */
export default function EditProfile() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [photoVersion, setPhotoVersion] = useState<number | null>(null)
  /** A new picture to upload, "remove" to delete the current one, or null to leave it alone. */
  const [photo, setPhoto] = useState<string | 'remove' | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api<{ profile: Profile & { photoVersion: number | null } }>('/profile')
      .then(({ profile }) => {
        setDraft(toDraft(profile))
        setPhotoVersion(profile.photoVersion)
      })
      .catch(() => setFailed(true))
  }, [])

  const back = () => navigate('/profile', { replace: true })

  async function save() {
    if (!draft) return
    setBusy(true)
    setFailed(false)
    try {
      if (photo === 'remove') await api('/profile/photo', { remove: true })
      else if (photo) await api('/profile/photo', { image: photo })
      await api('/profile', fromDraft(draft))
      await refresh()
      back()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  if (!draft || !user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Chai size={110} />
        {failed && <p className="text-base font-bold text-ink/60">{t('login.errors.network')}</p>}
      </div>
    )
  }

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={back}
          aria-label={t('privacy.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-ink/55 active:bg-ink/10"
        >
          ←
        </button>
        <h1 className="text-2xl font-extrabold leading-tight">{t('profile.edit')}</h1>
      </header>

      <main className="flex flex-1 flex-col gap-5 overflow-y-auto pb-2">
        <PhotoPicker
          userId={user.id}
          name={draft.name}
          photoVersion={photo === 'remove' ? null : photoVersion}
          preview={photo && photo !== 'remove' ? photo : null}
          onPick={setPhoto}
          onRemove={() => setPhoto('remove')}
        />

        <label className="flex flex-col gap-1.5">
          <span className={label}>{t('profile.name')}</span>
          <input
            className={fieldClass}
            placeholder={t('profile.namePlaceholder')}
            autoComplete="given-name"
            autoCapitalize="words"
            maxLength={LIMITS.name}
            value={draft.name ?? ''}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between">
            <span className={label}>{t('profile.bio')}</span>
            <span className="text-xs font-bold tabular-nums text-ink/40">
              {(draft.bio ?? '').length} / {LIMITS.bio}
            </span>
          </span>
          <textarea
            className={`${fieldClass} resize-none py-3 text-base font-semibold`}
            rows={3}
            placeholder={t('profile.bioPlaceholder')}
            maxLength={LIMITS.bio}
            value={draft.bio ?? ''}
            onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>{t('profile.city')}</span>
          <input
            className={fieldClass}
            placeholder={t('profile.cityPlaceholder')}
            autoComplete="address-level2"
            maxLength={LIMITS.city}
            value={draft.city ?? ''}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
          />
        </label>

        <AgeAndGender draft={draft} onChange={setDraft} />

        <div className="flex flex-col gap-1.5">
          <span className={label}>{t('profile.goals', { count: LIMITS.goals })}</span>
          <GoalChips value={draft.goals} onChange={(goals) => setDraft({ ...draft, goals })} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>{t('profile.interests')}</span>
          <InterestChips value={draft.interests} onChange={(interests) => setDraft({ ...draft, interests })} />
        </div>

        <label className="flex items-start gap-3 rounded-3xl bg-violet-soft p-4">
          <input
            type="checkbox"
            checked={draft.discoverable}
            onChange={(e) => setDraft({ ...draft, discoverable: e.target.checked })}
            className="mt-0.5 h-6 w-6 shrink-0 accent-violet"
          />
          <span>
            <span className="block text-base font-extrabold">{t('profile.discoverable')}</span>
            <span className="block text-sm font-semibold leading-snug text-ink/65">{t('profile.discoverableHint')}</span>
          </span>
        </label>

        <p className="text-sm font-semibold leading-snug text-ink/50">{t('profile.privacyNote')}</p>

        {failed && (
          <p role="alert" className="rounded-2xl bg-bad/15 p-3 text-center text-base font-bold text-bad-ink">
            {t('profile.saveFailed')}
          </p>
        )}
      </main>

      <Button onClick={save} disabled={busy}>
        {t('profile.save')}
      </Button>
    </div>
  )
}
