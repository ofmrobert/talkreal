import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Chai from './components/Chai'
import InstallGuide, { isStandalone } from './components/InstallGuide'

type ServerStatus = 'checking' | 'online' | 'offline'

export default function App() {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState<ServerStatus>('checking')
  const installed = isStandalone()

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'online' : 'offline'))
      .catch(() => setStatus('offline'))
  }, [])

  const nextLang = i18n.language === 'ru' ? 'en' : 'ru'
  const dot = { checking: 'bg-sun', online: 'bg-mint', offline: 'bg-coral' }[status]

  return (
    <main className="safe-screen mx-auto flex min-h-full max-w-md flex-col items-center gap-6 text-center">
      <header className="flex w-full items-center justify-between">
        <span className="text-xl font-extrabold tracking-tight text-coral">Talkreal</span>
        <button
          onClick={() => i18n.changeLanguage(nextLang)}
          className="min-h-11 min-w-11 rounded-full bg-white px-4 text-sm font-bold uppercase shadow-[0_3px_0_0_rgba(31,27,58,0.1)] active:translate-y-0.5"
        >
          {nextLang}
        </button>
      </header>

      <div className="mt-4">
        <Chai />
      </div>

      <div>
        <h1 className="text-3xl font-extrabold leading-tight">{t('hello.title')}</h1>
        <p className="mt-3 text-base opacity-75">{t('hello.subtitle')}</p>
      </div>

      <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {t(`status.${status}`)}
      </div>

      {installed ? (
        <p className="w-full rounded-3xl bg-mint/15 p-5 text-base font-bold text-ink">
          {t('hello.installed')}
        </p>
      ) : (
        <InstallGuide />
      )}
    </main>
  )
}
