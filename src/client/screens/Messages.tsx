import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Inbox } from '../../shared/social'
import Verified from '../components/Verified'
import { useMessageLabel } from '../components/social/MessageBubble'
import Avatar from '../components/Avatar'
import Chai from '../components/Chai'
import { BackButton, MessagingRules, useFaceName } from '../components/social/SocialBits'
import { api } from '../lib/api'

/** The student's private conversations with other students. */
export default function Messages() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useFaceName()
  const label = useMessageLabel()
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [failed, setFailed] = useState(false)

  function load() {
    api<Inbox>('/social/messages')
      .then(setInbox)
      .catch(() => setFailed(true))
  }
  useEffect(() => {
    load()
    // New messages show up without pulling to refresh.
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 15_000)
    return () => clearInterval(timer)
  }, [])

  if (!inbox) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Chai size={110} />
        {failed && <p className="text-base font-bold text-ink/60">{t('login.errors.network')}</p>}
      </div>
    )
  }

  const when = (iso: string) => {
    const at = new Date(iso)
    const today = new Date().toDateString() === at.toDateString()
    return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'ru-RU', today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }).format(at)
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3 pt-1">
        <BackButton to="/feed" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold leading-tight">{t('social.messages.title')}</h1>
          <p className="text-sm font-semibold text-ink/60">{t('social.messages.subtitle')}</p>
        </div>
      </header>

      {inbox.block === 'pro' && (
        <button
          type="button"
          onClick={() => navigate('/plans')}
          className="relative overflow-hidden rounded-3xl bg-night p-4 text-left text-white shadow-[0_6px_0_0_rgb(var(--shade)/0.25)] active:translate-y-1"
        >
          <span className="float-slow absolute -right-4 -top-6 h-24 w-24 rounded-full bg-white/10" aria-hidden="true" />
          <p className="text-lg font-extrabold leading-tight">{inbox.unread > 0 ? t('social.messages.lockedUnread', { count: inbox.unread }) : t('social.messages.lockedTitle')}</p>
          <p className="mt-1 text-sm font-semibold text-white/75">{t('social.messages.lockedText')}</p>
          <span className="mt-3 inline-flex min-h-10 items-center rounded-2xl bg-sun px-4 text-sm font-extrabold text-coal">👑 {t('social.messages.lockedButton')}</span>
        </button>
      )}
      {inbox.block === 'rules' && <MessagingRules onAccepted={load} />}
      {(inbox.block === 'age' || inbox.block === 'banned') && <p className="rounded-3xl bg-card p-4 text-base font-semibold leading-snug text-ink/70">{t(`social.messages.${inbox.block}`)}</p>}

      {inbox.threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => navigate(`/messages/${thread.other.userId}`)}
          className="flex items-center gap-3 rounded-3xl bg-card p-3.5 text-left shadow-[0_5px_0_0_rgb(var(--shade)/0.07)] active:translate-y-0.5"
        >
          <Avatar userId={thread.other.userId} name={thread.other.name} photoVersion={thread.other.photoVersion} size={52} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-2">
              <span className="truncate text-base font-extrabold">{nameOf(thread.other)}</span>
              {thread.other.teacher && <Verified owner={thread.other.owner} />}
              {thread.incoming && <span className="shrink-0 rounded-full bg-sun px-2 py-0.5 text-[11px] font-extrabold text-coal">{t('social.messages.request')}</span>}
              {thread.status === 'declined' && <span className="shrink-0 rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-extrabold text-ink/55">{t('social.messages.declined')}</span>}
            </span>
            <span className={`mt-1 block truncate text-sm ${thread.unread > 0 ? 'font-extrabold text-ink' : 'font-semibold text-ink/55'}`}>
              {thread.last?.mine && `${t('social.messages.you')}: `}
              {thread.last && thread.last.kind !== 'text' ? label(thread.last) : thread.last?.text || `🔒 ${t('social.messages.hiddenText')}`}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-xs font-bold text-ink/40">{thread.last ? when(thread.last.at) : ''}</span>
            {thread.unread > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-coral px-1.5 text-xs font-extrabold text-white">{thread.unread}</span>}
          </span>
        </button>
      ))}

      {inbox.threads.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-3xl bg-card p-6 text-center">
          <Chai size={96} />
          <p className="text-lg font-extrabold leading-tight">{t('social.messages.emptyTitle')}</p>
          <p className="text-sm font-semibold leading-snug text-ink/60">{t('social.messages.emptyText')}</p>
          <button
            type="button"
            onClick={() => navigate('/people')}
            className="min-h-12 rounded-2xl bg-coral px-5 text-base font-extrabold text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1"
          >
            👥 {t('social.messages.find')}
          </button>
        </section>
      )}
    </div>
  )
}
