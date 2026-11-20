import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../lib/api'
import { pushIsOnHere, pushSupported, turnPushOn } from '../lib/push'
import { isStandalone } from './InstallGuide'
import Button from './ui/Button'

interface ReminderInfo {
  enabled: boolean
  /** Followers, messages, comments and prizes. */
  social: boolean
  /** The post of the day and the weekly challenge, in the morning. */
  feed: boolean
  hour: number
  telegram: { available: boolean; linked: boolean }
  push: { publicKey: string; devices: number }
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7) // 07:00 … 23:00

/** Profile section: daily reminders through Telegram and phone notifications. */
export default function Reminders() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'ru'
  const [info, setInfo] = useState<ReminderInfo | null>(null)
  const [thisPhone, setThisPhone] = useState(false)
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setInfo(await api<ReminderInfo>('/reminders'))
    } catch {
      // Offline: the section simply stays hidden.
    }
  }, [])

  useEffect(() => {
    // Keep the server's idea of this student's timezone and language fresh: reminders depend on both.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    api('/reminders', { tz, lang })
      .catch(() => {})
      .finally(refresh)
  }, [lang, refresh])

  // Is this very phone already subscribed? If so, make sure the server still knows about it.
  useEffect(() => {
    let cancelled = false
    void pushIsOnHere().then((on) => {
      if (!cancelled && on) setThisPhone(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // While the Telegram link is on screen, keep checking whether the student pressed Start.
  useEffect(() => {
    if (!telegramUrl) return
    const check = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = setInterval(check, 2000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [telegramUrl, refresh])

  useEffect(() => {
    if (info?.telegram.linked) setTelegramUrl(null)
  }, [info?.telegram.linked])

  if (!info) return null

  async function change(changes: { enabled?: boolean; hour?: number; social?: boolean; feed?: boolean }) {
    setInfo({ ...info!, ...changes })
    await api('/reminders', changes).catch(() => refresh())
  }

  async function connectTelegram() {
    setBusy(true)
    setNote(null)
    try {
      setTelegramUrl((await api<{ url: string }>('/reminders/telegram/link', {})).url)
    } catch {
      setNote(t('login.errors.server_error'))
    } finally {
      setBusy(false)
    }
  }

  async function enablePush() {
    setBusy(true)
    setNote(null)
    const result = await turnPushOn(info!.push.publicKey)
    if (result === 'on') {
      setThisPhone(true)
      await refresh()
    } else setNote(t(result === 'denied' ? 'reminders.pushDenied' : 'reminders.pushUnsupported'))
    setBusy(false)
  }

  async function sendTest() {
    setBusy(true)
    setNote(null)
    try {
      const sent = await api<{ telegram: boolean; push: number }>('/reminders/test', { lang })
      setNote(sent.telegram || sent.push > 0 ? t('reminders.testSent') : t('reminders.testNone'))
    } catch (err) {
      setNote(err instanceof ApiError && err.code === 'wait' ? t('reminders.testWait') : t('login.errors.server_error'))
    } finally {
      setBusy(false)
    }
  }

  const hasChannel = info.telegram.linked || info.push.devices > 0
  const anyOn = info.enabled || info.social || info.feed

  return (
    <section>
      <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-ink/50">{t('reminders.title')}</h2>
      <div className="flex flex-col gap-3 rounded-3xl bg-card p-4">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-base font-extrabold">{t('reminders.toggle')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={info.enabled}
            onChange={(e) => change({ enabled: e.target.checked })}
            className="h-7 w-7 accent-coral"
          />
        </label>

        {info.enabled && (
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-base font-bold text-ink/70">{t('reminders.time')}</span>
              <select
                value={info.hour}
                onChange={(e) => change({ hour: Number(e.target.value) })}
                className="min-h-11 rounded-xl border-2 border-ink/10 bg-cream px-3 text-base font-extrabold"
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
        )}

        {(['social', 'feed'] as const).map((kind) => (
          <label key={kind} className="flex min-h-11 items-center justify-between gap-3 border-t border-ink/5 pt-3">
            <span className="min-w-0">
              <span className="block text-base font-extrabold">{t(`reminders.${kind}`)}</span>
              <span className="block text-sm font-semibold leading-snug text-ink/55">{t(`reminders.${kind}Hint`)}</span>
            </span>
            <input type="checkbox" role="switch" checked={info[kind]} onChange={(e) => change({ [kind]: e.target.checked })} className="h-7 w-7 shrink-0 accent-coral" />
          </label>
        ))}

        {anyOn && (
          <>
            {!hasChannel && <p className="rounded-2xl bg-sun/30 p-3 text-sm font-bold">{t('reminders.needChannel')}</p>}

            {/* Telegram */}
            {info.telegram.linked ? (
              <p className="flex min-h-11 items-center gap-2 text-base font-bold text-ink/70">
                <span className="text-mint">✓</span> {t('reminders.telegramLinked')}
              </p>
            ) : telegramUrl ? (
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#2AABEE] px-6 text-center text-base font-extrabold text-white shadow-[0_5px_0_0_#1E8FC9] active:translate-y-1 active:shadow-none"
              >
                {t('reminders.telegramOpen')}
              </a>
            ) : (
              info.telegram.available && (
                <Button type="button" variant="secondary" disabled={busy} onClick={connectTelegram}>
                  {t('reminders.telegramConnect')}
                </Button>
              )
            )}

            {/* Notifications on this phone */}
            {thisPhone ? (
              <p className="flex min-h-11 items-center gap-2 text-base font-bold text-ink/70">
                <span className="text-mint">✓</span> {t('reminders.pushOn')}
              </p>
            ) : pushSupported() ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={enablePush}>
                {t('reminders.pushEnable')}
              </Button>
            ) : (
              !isStandalone() && <p className="text-sm font-semibold text-ink/55">{t('reminders.pushNeedsInstall')}</p>
            )}

            {hasChannel && (
              <Button type="button" variant="ghost" disabled={busy} onClick={sendTest}>
                {t('reminders.test')}
              </Button>
            )}
          </>
        )}

        {note && (
          <p role="status" className="rounded-2xl bg-cream p-3 text-center text-sm font-bold text-ink/70">
            {note}
          </p>
        )}
      </div>
    </section>
  )
}
