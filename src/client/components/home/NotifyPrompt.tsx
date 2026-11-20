import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { pushIsOnHere, pushSupported, turnPushOn } from '../../lib/push'
import { isStandalone } from '../InstallGuide'

interface ReminderInfo {
  telegram: { available: boolean; linked: boolean }
  push: { publicKey: string; devices: number }
}

const KEY = 'talkreal.notifyAsked'
/** After "not now" the card stays away this long, then asks once more. */
const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function snoozed(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < ASK_AGAIN_AFTER_MS
  } catch {
    return false
  }
}

/**
 * On the Learn tab: suggests switching notifications on, to a student who has no way of
 * hearing from the app yet. The phone's own permission question appears only after a tap here.
 * Where phone notifications cannot work, it offers Telegram instead.
 */
export default function NotifyPrompt() {
  const { t, i18n } = useTranslation()
  const [info, setInfo] = useState<ReminderInfo | null>(null)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // The reminders need the student's own clock and language; this keeps them right.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      await api('/reminders', { tz, lang: i18n.language === 'en' ? 'en' : 'ru' }).catch(() => {})
      if (snoozed()) return
      const [data, onHere] = await Promise.all([api<ReminderInfo>('/reminders').catch(() => null), pushIsOnHere()])
      if (cancelled || !data) return
      setInfo(data)
      // Already reachable on this device or through Telegram: nothing to ask.
      setShow(!onHere && !data.telegram.linked)
    })()
    return () => {
      cancelled = true
    }
  }, [i18n.language])

  // While the Telegram link is on screen, keep checking whether the student pressed Start.
  useEffect(() => {
    if (!telegramUrl) return
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      const data = await api<ReminderInfo>('/reminders').catch(() => null)
      if (data?.telegram.linked) {
        setTelegramUrl(null)
        setDone(true)
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [telegramUrl])

  if (!show || !info) return null

  const canPush = pushSupported() && Notification.permission !== 'denied'
  const canTelegram = info.telegram.available
  // iPhone shows notifications only for an app added to the Home screen.
  const needsInstall = !pushSupported() && !isStandalone()

  function later() {
    try {
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      // Not remembered: the card comes back next time.
    }
    setShow(false)
  }

  async function enable() {
    setBusy(true)
    setNote(null)
    const result = await turnPushOn(info!.push.publicKey)
    setBusy(false)
    if (result === 'on') setDone(true)
    else setNote(t(result === 'denied' ? 'reminders.pushDenied' : 'reminders.pushUnsupported'))
  }

  async function telegram() {
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

  if (done) {
    return (
      <section className="pop-in flex items-center gap-3 rounded-3xl bg-good-soft p-4" role="status">
        <span className="text-3xl" aria-hidden="true">
          🔔
        </span>
        <p className="flex-1 text-base font-extrabold leading-snug text-good-ink">{t('notify.done')}</p>
        <button type="button" onClick={() => setShow(false)} className="min-h-10 px-2 text-sm font-extrabold text-good-ink underline">
          {t('notify.ok')}
        </button>
      </section>
    )
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-night p-4 text-white shadow-[0_6px_0_0_rgb(var(--shade)/0.25)]">
      <span className="float-slow absolute -right-5 -top-7 h-24 w-24 rounded-full bg-white/10" aria-hidden="true" />
      <div className="flex items-start gap-3">
        <span className="text-4xl" aria-hidden="true">
          🔔
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold leading-tight">{t('notify.title')}</h2>
          <p className="mt-1 text-sm font-semibold leading-snug text-white/75">{t('notify.text')}</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-sm font-bold text-white/85">
        {(['practice', 'messages', 'feed'] as const).map((key) => (
          <li key={key}>
            {{ practice: '🔥', messages: '✉️', feed: '✨' }[key]} {t(`notify.points.${key}`)}
          </li>
        ))}
      </ul>

      {needsInstall && !canTelegram && <p className="mt-3 rounded-2xl bg-white/10 p-3 text-sm font-semibold leading-snug">{t('reminders.pushNeedsInstall')}</p>}
      {note && (
        <p role="status" className="mt-3 rounded-2xl bg-white/10 p-3 text-sm font-bold leading-snug">
          {note}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {canPush && (
          <button type="button" disabled={busy} onClick={enable} className="min-h-12 rounded-2xl bg-sun px-4 text-base font-extrabold text-coal shadow-[0_4px_0_0_var(--color-sun-dark)] active:translate-y-1 disabled:opacity-60">
            {t('notify.enable')}
          </button>
        )}
        {telegramUrl ? (
          <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#2AABEE] px-4 text-center text-base font-extrabold text-white active:translate-y-0.5">
            {t('reminders.telegramOpen')}
          </a>
        ) : (
          canTelegram && (
            <button
              type="button"
              disabled={busy}
              onClick={telegram}
              className={`min-h-12 rounded-2xl px-4 text-base font-extrabold active:translate-y-0.5 disabled:opacity-60 ${canPush ? 'bg-white/10 text-white' : 'bg-sun text-coal shadow-[0_4px_0_0_var(--color-sun-dark)]'}`}
            >
              {t(canPush ? 'notify.telegramAlso' : 'notify.telegram')}
            </button>
          )
        )}
        {needsInstall && canTelegram && <p className="text-xs font-semibold leading-snug text-white/60">{t('reminders.pushNeedsInstall')}</p>}
        <button type="button" onClick={later} className="min-h-10 text-sm font-extrabold text-white/60">
          {t('notify.later')}
        </button>
      </div>
    </section>
  )
}
