import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import InstallGuide, { isStandalone } from '../components/InstallGuide'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'

const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
]

/** Profile tab: the student's numbers, app language, and logout. */
export default function Profile() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const stats = [
    { label: t('profile.streak'), value: String(user?.currentStreak ?? 0) },
    { label: t('profile.xp'), value: String(user?.xp ?? 0) },
    { label: t('profile.level'), value: user?.level ?? '—' },
    // Voice minutes are counted from the voice-conversation step onward.
    { label: t('profile.minutes'), value: '0' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-1">
        <h1 className="text-3xl font-extrabold">{t('profile.title')}</h1>
        {user?.email && <p className="mt-1 truncate text-base font-bold text-ink/55">{user.email}</p>}
      </header>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-3xl font-extrabold">{s.value}</div>
            <div className="mt-1 text-sm font-bold text-ink/55">{s.label}</div>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-ink/50">
          {t('profile.language')}
        </h2>
        <div className="flex gap-2 rounded-2xl bg-white p-1.5">
          {LANGUAGES.map((lang) => {
            const active = i18n.language === lang.code
            return (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                aria-pressed={active}
                className={`min-h-12 flex-1 rounded-xl text-base font-extrabold transition-colors ${
                  active ? 'bg-coral text-white' : 'text-ink/60'
                }`}
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
    </div>
  )
}
