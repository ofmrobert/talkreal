import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import InstallGuide, { isStandalone } from '../components/InstallGuide'
import Reminders from '../components/Reminders'
import Button from '../components/ui/Button'

const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
]

/** Everything that is a setting and not part of the profile: reminders, language, level, logout. */
export default function Settings() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/profile', { replace: true })}
          aria-label={t('privacy.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-ink/55 active:bg-ink/10"
        >
          ←
        </button>
        <h1 className="text-2xl font-extrabold leading-tight">{t('settings.title')}</h1>
      </header>

      <main className="flex flex-1 flex-col gap-5 overflow-y-auto pb-4">
        {(user?.email ?? user?.displayName) && (
          <p className="truncate rounded-2xl bg-white px-4 py-3 text-base font-bold text-ink/65">
            {t('settings.account')}: <span className="text-ink">{user?.email ?? user?.displayName}</span>
          </p>
        )}

        <Reminders />

        <section>
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-ink/50">{t('profile.language')}</h2>
          <div className="flex gap-2 rounded-2xl bg-white p-1.5">
            {LANGUAGES.map((lang) => {
              const active = i18n.language === lang.code
              return (
                <button
                  key={lang.code}
                  onClick={() => i18n.changeLanguage(lang.code)}
                  aria-pressed={active}
                  className={`min-h-12 flex-1 rounded-xl text-base font-extrabold transition-colors ${active ? 'bg-coral text-white' : 'text-ink/60'}`}
                >
                  {lang.label}
                </button>
              )
            })}
          </div>
        </section>

        <Button variant="secondary" onClick={() => navigate('/placement')}>
          {t('profile.changeLevel')}
        </Button>

        {!isStandalone() && <InstallGuide />}

        <Button variant="secondary" onClick={logout}>
          {t('profile.logout')}
        </Button>

        <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-2 text-sm font-bold text-ink/50">
          <Link to="/plans" className="underline">
            {t('plans.title')}
          </Link>
          <Link to="/offer" className="underline">
            {t('plans.offer')}
          </Link>
          <Link to="/privacy" className="underline">
            {t('privacy.link')}
          </Link>
        </p>
      </main>
    </div>
  )
}
