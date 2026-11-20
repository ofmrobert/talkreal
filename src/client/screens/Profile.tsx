import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import Achievements from '../components/Achievements'
import InstallGuide, { isStandalone } from '../components/InstallGuide'
import Reminders from '../components/Reminders'
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
    { label: t('freeze.label'), value: String(user?.freezes ?? 0) },
  ]

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-1">
        <h1 className="text-3xl font-extrabold">{t('profile.title')}</h1>
        {(user?.email ?? user?.displayName) && (
          <p className="mt-1 truncate text-base font-bold text-ink/55">{user?.email ?? user?.displayName}</p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-3xl font-extrabold">{s.value}</div>
            <div className="mt-1 text-sm font-bold text-ink/55">{s.label}</div>
          </Card>
        ))}
      </div>

      <Link
        to="/plans"
        className={`flex items-center gap-3 rounded-3xl p-4 active:translate-y-0.5 ${user?.plan && user.plan !== 'free' ? 'bg-ink text-white' : 'bg-white shadow-[0_5px_0_0_rgba(31,27,58,0.07)]'}`}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sun text-2xl" aria-hidden="true">
          👑
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold leading-tight">{t('plans.yourPlan', { plan: t(`plans.name.${user?.plan ?? 'free'}`) })}</span>
          <span className="block text-sm font-semibold opacity-65">{user?.plan && user.plan !== 'free' ? t('plans.manage') : t('plans.upgradeHint')}</span>
        </span>
        <span className="text-2xl font-extrabold opacity-40" aria-hidden="true">
          ›
        </span>
      </Link>

      {user?.isAdmin && (
        <Link to="/admin" className="flex min-h-12 items-center justify-center rounded-2xl bg-ink px-4 text-base font-extrabold text-white active:translate-y-0.5">
          Admin panel
        </Link>
      )}

      <Achievements />

      <Reminders />

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
    </div>
  )
}
