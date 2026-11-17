import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import Button from './ui/Button'
import { api } from '../lib/api'

const POLL_EVERY_MS = 2000

function TelegramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.8.8l-4.8-3.6-2.3 2.3c-.3.3-.5.5-1 .5l.3-4.9 9-8.1c.4-.3-.1-.5-.6-.2L6.4 12.8l-4.8-1.5c-1-.3-1-1 .2-1.5l18.7-7.2c.9-.3 1.6.2 1.4 1.7z" />
    </svg>
  )
}

/**
 * "Log in with Telegram". Shown only when the server says the bot is reachable.
 * After the student taps it, we show a link to the bot and keep checking for their confirmation.
 */
export default function TelegramLogin({ onError }: { onError: (code: string) => void }) {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const [available, setAvailable] = useState(false)
  const [login, setLogin] = useState<{ url: string; pollToken: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ telegram: boolean }>('/auth/providers')
      .then((p) => setAvailable(p.telegram))
      .catch(() => setAvailable(false))
  }, [])

  useEffect(() => {
    if (!login) return
    const timer = setInterval(async () => {
      try {
        const res = await api<{ status: string }>('/auth/telegram/poll', {
          pollToken: login.pollToken,
          lang: i18n.language,
        })
        if (res.status === 'ok') {
          setLogin(null)
          await refresh()
        } else if (res.status === 'expired') {
          setLogin(null)
          onError('expired')
        }
      } catch {
        // No connection right now (e.g. the app was in the background): try again on the next tick.
      }
    }, POLL_EVERY_MS)
    return () => clearInterval(timer)
  }, [login, i18n.language, refresh, onError])

  if (!available) return null

  async function start() {
    setBusy(true)
    try {
      setLogin(await api<{ url: string; pollToken: string }>('/auth/telegram/start', {}))
    } catch {
      onError('server_error')
    } finally {
      setBusy(false)
    }
  }

  if (login) {
    return (
      <div className="flex flex-col gap-3 rounded-3xl bg-white p-4 text-center">
        <p className="text-base font-bold">{t('login.telegramWaiting')}</p>
        <a
          href={login.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#2AABEE] px-6 text-lg font-extrabold text-white shadow-[0_5px_0_0_#1E8FC9] active:translate-y-1 active:shadow-none"
        >
          <TelegramIcon />
          {t('login.telegramOpen')}
        </a>
        <Button type="button" variant="ghost" onClick={() => setLogin(null)}>
          {t('login.telegramCancel')}
        </Button>
      </div>
    )
  }

  return (
    <Button type="button" variant="secondary" disabled={busy} onClick={start}>
      <span className="text-[#2AABEE]">
        <TelegramIcon />
      </span>
      {t('login.telegram')}
    </Button>
  )
}
