import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MESSAGE_MAX_LENGTH, type DirectMessage, type ThreadView } from '../../shared/social'
import Verified from '../components/Verified'
import Avatar from '../components/Avatar'
import Chai from '../components/Chai'
import { MessagingRules, SafetyMenu, useFaceName } from '../components/social/SocialBits'
import { api, ApiError } from '../lib/api'

/** A private conversation with one student. It checks for new messages every few seconds while open. */
export default function DirectChat() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const nameOf = useFaceName()
  const [view, setView] = useState<ThreadView | null>(null)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const count = view?.messages.length ?? 0

  function load() {
    api<ThreadView>(`/social/messages/with/${id}`)
      .then(setView)
      .catch(() => setFailed(true))
  }
  useEffect(() => {
    load()
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 4000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Keeps the newest message in view when one arrives.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [count])

  if (!view) {
    return (
      <div className="safe-screen mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 text-center">
        <Chai size={110} />
        {failed && (
          <>
            <p className="text-base font-bold text-ink/60">{t('social.profile.notFound')}</p>
            <button type="button" onClick={() => navigate('/messages')} className="min-h-11 text-sm font-extrabold text-coral-ink underline">
              {t('social.back')}
            </button>
          </>
        )}
      </div>
    )
  }

  async function send(e: Pick<FormEvent, 'preventDefault'>) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy || !view) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ message: DirectMessage; status: ThreadView['status'] }>(`/social/messages/with/${id}`, { text })
      setView({ ...view, status: result.status, incoming: false, waiting: result.status === 'request', messages: [...view.messages, result.message] })
      setDraft('')
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network'
      if (code === 'pro') navigate('/plans')
      else setError(t(['rejected', 'waiting', 'declined', 'blocked', 'closed', 'slow_down', 'banned', 'age'].includes(code) ? `social.chat.errors.${code}` : 'feed.failed'))
      load()
    } finally {
      setBusy(false)
    }
  }

  async function answer(accept: boolean) {
    await api(`/social/messages/with/${id}/answer`, { accept }).catch(() => {})
    if (accept) load()
    else navigate('/messages')
  }

  const time = (iso: string) => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  const day = (iso: string) => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso))
  const name = nameOf(view.other)
  // Why the box to write is not shown, if it is not.
  const closed = view.blocked ? 'blocked' : view.block === 'age' || view.block === 'banned' ? view.block : view.turnedDown ? 'declined' : view.waiting ? 'waiting' : null

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-3">
      <header className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => navigate('/messages')}
          aria-label={t('social.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-xl font-extrabold text-ink/60 active:translate-y-0.5"
        >
          ←
        </button>
        <button type="button" onClick={() => navigate(`/u/${view.other.userId}`)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <Avatar userId={view.other.userId} name={view.other.name} photoVersion={view.other.photoVersion} size={44} />
          <span className="min-w-0 leading-tight">
            <span className="flex items-center gap-1.5 text-lg font-extrabold">
              <span className="truncate">{name}</span>
              {view.other.teacher && <Verified size={18} owner={view.other.owner} />}
            </span>
            <span className="block truncate text-xs font-bold text-ink/45">{t('social.chat.openProfile')}</span>
          </span>
        </button>
        <SafetyMenu userId={view.other.userId} blocked={view.blocked} onBlocked={load} />
      </header>

      <main className="flex flex-1 flex-col gap-2.5 overflow-y-auto rounded-3xl bg-card/60 p-4" aria-live="polite">
        {view.messages.length === 0 && view.block !== 'rules' && (
          <div className="m-auto flex flex-col items-center gap-3 text-center">
            <Avatar userId={view.other.userId} name={view.other.name} photoVersion={view.other.photoVersion} size={88} />
            <p className="max-w-72 text-base font-semibold leading-snug text-ink/55">{t('social.chat.intro', { name })}</p>
          </div>
        )}

        {view.messages.map((message, i) => {
          const newDay = i === 0 || new Date(view.messages[i - 1].at).toDateString() !== new Date(message.at).toDateString()
          return (
            <div key={message.id} className="flex flex-col gap-2.5">
              {newDay && <p className="self-center rounded-full bg-card px-3 py-1 text-xs font-extrabold text-ink/45">{day(message.at)}</p>}
              <div className={`bubble-in flex max-w-[86%] flex-col gap-1 ${message.mine ? 'items-end self-end' : 'items-start self-start'}`}>
                {message.hidden ? (
                  <p className="rounded-3xl bg-ink/5 px-4 py-2.5 text-sm font-semibold italic text-ink/45">{t('social.chat.hidden')}</p>
                ) : view.block === 'pro' && !message.mine ? (
                  <p className="flex select-none flex-col gap-1.5 rounded-3xl rounded-bl-md bg-card px-4 py-3 blur-[5px]" aria-hidden="true">
                    <span className="h-3 w-40 rounded-full bg-ink/35" />
                    <span className="h-3 w-24 rounded-full bg-ink/25" />
                  </p>
                ) : (
                  <p
                    className={`select-text whitespace-pre-line break-words rounded-3xl px-4 py-2.5 text-base font-semibold leading-snug ${
                      message.mine ? 'rounded-br-md bg-coral text-white' : 'rounded-bl-md bg-card shadow-[0_3px_0_0_rgb(var(--shade)/0.06)]'
                    }`}
                  >
                    {message.text}
                  </p>
                )}
                {message.better && (
                  <p className="select-text rounded-2xl bg-good-soft px-3 py-2 text-sm font-semibold leading-snug text-good-ink">
                    <span className="font-extrabold">✍️ {t('social.chat.better')}</span> {message.better}
                  </p>
                )}
                <span className="px-1 text-[11px] font-bold text-ink/35">{time(message.at)}</span>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </main>

      {view.block === 'rules' ? (
        <MessagingRules onAccepted={load} />
      ) : view.block === 'pro' ? (
        <button type="button" onClick={() => navigate('/plans')} className="rounded-3xl bg-night p-4 text-left text-white shadow-[0_6px_0_0_rgb(var(--shade)/0.25)] active:translate-y-1">
          <p className="text-base font-extrabold leading-tight">{t('social.chat.lockedTitle', { name })}</p>
          <span className="mt-2 inline-flex min-h-10 items-center rounded-2xl bg-sun px-4 text-sm font-extrabold text-coal">👑 {t('social.messages.lockedButton')}</span>
        </button>
      ) : view.incoming && !view.blocked ? (
        <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
          <p className="text-base font-extrabold leading-snug">{t('social.chat.requestTitle', { name })}</p>
          <p className="text-sm font-semibold leading-snug text-ink/60">{t('social.chat.requestText')}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => answer(true)} className="min-h-12 flex-1 rounded-2xl bg-mint px-3 text-base font-extrabold text-white shadow-[0_4px_0_0_var(--color-mint-dark)] active:translate-y-1">
              {t('social.chat.accept')}
            </button>
            <button type="button" onClick={() => answer(false)} className="min-h-12 flex-1 rounded-2xl bg-card px-3 text-base font-extrabold text-ink ring-2 ring-inset ring-ink/10 active:translate-y-0.5">
              {t('social.chat.decline')}
            </button>
          </div>
        </section>
      ) : closed ? (
        <p className="rounded-3xl bg-card p-4 text-center text-sm font-bold leading-snug text-ink/60">{t(`social.chat.closed.${closed}`, { name })}</p>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-1.5">
          {error && (
            <p role="alert" className="px-1 text-sm font-bold text-bad-ink">
              {error}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) void send(e)
              }}
              rows={draft.length > 70 || draft.includes('\n') ? 3 : 1}
              lang="en"
              placeholder={t('social.chat.placeholder')}
              aria-label={t('social.chat.placeholder')}
              className="min-h-12 flex-1 select-text resize-none rounded-2xl border-2 border-ink/10 bg-card px-3 py-2.5 text-base font-semibold outline-none placeholder:text-ink/35 focus:border-coral"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label={t('chat.send')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral text-xl font-extrabold text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 disabled:opacity-50"
            >
              ↑
            </button>
          </div>
          <p className="px-1 text-center text-[11px] font-semibold leading-snug text-ink/40">🛡️ {t('social.chat.note')}</p>
        </form>
      )}
    </div>
  )
}
