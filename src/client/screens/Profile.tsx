import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import InstallGuide, { isStandalone } from '../components/InstallGuide'
import Card from '../components/ui/Card'

type ServerStatus = 'checking' | 'online' | 'offline'

const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
]

/** Profile tab. The numbers are placeholders until accounts exist. */
export default function Profile() {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState<ServerStatus>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
  }, [])

  const stats = [
    { label: t('profile.streak'), value: '0' },
    { label: t('profile.xp'), value: '0' },
    { label: t('profile.level'), value: '—' },
    { label: t('profile.minutes'), value: '0' },
  ]
  const dot = { checking: 'bg-sun', online: 'bg-mint', offline: 'bg-coral' }[status]

  return (
    <div className="flex flex-col gap-5">
      <h1 className="pt-1 text-3xl font-extrabold">{t('profile.title')}</h1>

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

      {!isStandalone() && <InstallGuide />}

      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-ink/55">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {t(`status.${status}`)}
      </div>
    </div>
  )
}
