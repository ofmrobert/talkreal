import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MESSAGE_MAX_LENGTH, type DirectMessage, type ThreadView } from '../../shared/social'
import Verified from '../components/Verified'
import Avatar from '../components/Avatar'
import Chai from '../components/Chai'
import MessageBubble, { MessageMenu, useMessageLabel } from '../components/social/MessageBubble'
import { MicIcon, VideoNoteIcon } from '../components/social/MessageMedia'
import { VideoNoteRecorder, VoiceRecorderBar } from '../components/social/MessageRecorders'
import type { Recorded } from '../lib/recorder'
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
  /** The message being answered, shown above the box to write. */
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  /** The message whose menu is open, and where its bubble is on the screen. */
  const [menu, setMenu] = useState<{ message: DirectMessage; rect: DOMRect } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  /** A voice message or a video note is being recorded. */
  const [recording, setRecording] = useState<'voice' | 'video' | null>(null)
  const label = useMessageLabel()
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  /** Reactions on their way to the server: a refresh that lands meanwhile would undo them on screen. */
  const saving = useRef(0)
  const count = view?.messages.length ?? 0
  /** A reaction under the last message makes it taller: the list follows. */
  const lastReactions = view?.messages[count - 1]?.reactions.length ?? 0

  function load() {
    api<ThreadView>(`/social/messages/with/${id}`)
      .then((fresh) => saving.current === 0 && setView(fresh))
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
  }, [count, lastReactions])

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
      const result = await api<{ message: DirectMessage; status: ThreadView['status'] }>(`/social/messages/with/${id}`, { text, replyTo: replyTo?.id })
      setView({ ...view, status: result.status, incoming: false, waiting: result.status === 'request', messages: [...view.messages, result.message] })
      setDraft('')
      setReplyTo(null)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network'
      if (code === 'pro') navigate('/plans')
      else setError(t(['rejected', 'waiting', 'declined', 'blocked', 'closed', 'slow_down', 'banned', 'age'].includes(code) ? `social.chat.errors.${code}` : 'feed.failed'))
      load()
    } finally {
      setBusy(false)
    }
  }

  /** Sends a recording. Gives back what went wrong, in words, or null when it is sent. */
  async function sendRecording(kind: 'voice' | 'video', recorded: Recorded): Promise<string | null> {
    const query = new URLSearchParams({ kind, seconds: String(recorded.seconds), ...(recorded.waveform ? { wave: recorded.waveform } : {}), ...(replyTo ? { replyTo: replyTo.id } : {}) })
    try {
      const res = await fetch(`/api/social/messages/with/${id}/media?${query}`, { method: 'POST', headers: { 'Content-Type': recorded.blob.type || 'application/octet-stream' }, body: recorded.blob, credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code: string = data.error ?? ''
        return t(code === 'rejected' ? 'social.chat.errors.rejectedMedia' : ['too_big', 'not_open', 'blocked', 'slow_down', 'banned', 'age'].includes(code) ? `social.chat.errors.${code}` : 'feed.failed')
      }
      setView((now) => now && { ...now, status: data.status, messages: [...now.messages, data.message] })
      setReplyTo(null)
      setRecording(null)
      return null
    } catch {
      return t('feed.failed')
    }
  }

  /** Puts the emoji on the message, or takes it off if it is already the viewer's. Shown at once, then saved. */
  function react(message: DirectMessage, emoji: string) {
    const next = message.reactions.some((r) => r.mine && r.emoji === emoji) ? null : emoji
    const put = (reactions: DirectMessage['reactions']) => setView((now) => now && { ...now, messages: now.messages.map((m) => (m.id === message.id ? { ...m, reactions } : m)) })
    put([...message.reactions.filter((r) => !r.mine), ...(next ? [{ emoji: next, mine: true }] : [])])
    saving.current++
    api<{ reactions: DirectMessage['reactions'] }>(`/social/messages/react/${message.id}`, { emoji: next })
      .then((result) => put(result.reactions))
      .catch(() => put(message.reactions))
      .finally(() => saving.current--)
  }

  function reply(message: DirectMessage) {
    setReplyTo(message)
    input.current?.focus()
  }

  /** Scrolls to the message a reply points to and lights it up for a moment. */
  function jump(messageId: string) {
    const target = document.getElementById(`m-${messageId}`)
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlash(messageId)
    setTimeout(() => setFlash((now) => (now === messageId ? null : now)), 1400)
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
  // Replying needs the box to write; reacting also needs the conversation to be going on.
  const canReply = view.block === null && !view.incoming && closed === null
  const canReact = canReply && view.status === 'open'

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

      <main className="flex flex-1 flex-col gap-2.5 overflow-y-auto overflow-x-hidden rounded-3xl bg-card/60 p-4" aria-live="polite">
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
              {message.hidden ? (
                <div className={`flex max-w-[86%] flex-col gap-1 ${message.mine ? 'items-end self-end' : 'items-start self-start'}`}>
                  <p className="rounded-3xl bg-ink/5 px-4 py-2.5 text-sm font-semibold italic text-ink/45">{t('social.chat.hidden')}</p>
                  <span className="px-1 text-[11px] font-bold text-ink/35">{time(message.at)}</span>
                </div>
              ) : view.block === 'pro' && !message.mine ? (
                <div className="flex max-w-[86%] flex-col items-start gap-1 self-start">
                  <p className="flex select-none flex-col gap-1.5 rounded-3xl rounded-bl-md bg-card px-4 py-3 blur-[5px]" aria-hidden="true">
                    <span className="h-3 w-40 rounded-full bg-ink/35" />
                    <span className="h-3 w-24 rounded-full bg-ink/25" />
                  </p>
                  <span className="px-1 text-[11px] font-bold text-ink/35">{time(message.at)}</span>
                </div>
              ) : (
                <MessageBubble
                  message={message}
                  name={name}
                  time={time(message.at)}
                  canReact={canReact}
                  canReply={canReply}
                  flash={flash === message.id}
                  onReact={(emoji) => react(message, emoji)}
                  onReply={() => reply(message)}
                  onJump={jump}
                  onMenu={(rect) => setMenu({ message, rect })}
                />
              )}
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
          {replyTo && (
            <div className="flex items-center gap-2 rounded-2xl border-l-4 border-coral bg-card py-1.5 pl-3 pr-1.5">
              <span className="text-lg font-extrabold text-coral-ink" aria-hidden="true">
                ↩
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-xs font-extrabold text-coral-ink">{replyTo.mine ? t('social.chat.you') : name}</span>
                <span className="block truncate text-sm font-semibold text-ink/60">{label(replyTo)}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={t('social.chat.cancelReply')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-ink/45 active:bg-ink/5">
                ✕
              </button>
            </div>
          )}
          {recording === 'voice' ? (
            <VoiceRecorderBar onSend={(recorded) => sendRecording('voice', recorded)} onClose={() => setRecording(null)} />
          ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={input}
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
            {view.media && !draft.trim() ? (
              <>
                <button type="button" onClick={() => setRecording('video')} aria-label={t('social.chat.recordVideo')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card text-coral-ink shadow-[0_4px_0_0_rgb(var(--shade)/0.08)] active:translate-y-1">
                  <VideoNoteIcon size={24} />
                </button>
                <button type="button" onClick={() => setRecording('voice')} aria-label={t('social.chat.recordVoice')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1">
                  <MicIcon size={24} />
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                aria-label={t('chat.send')}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral text-xl font-extrabold text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 disabled:opacity-50"
              >
                ↑
              </button>
            )}
          </div>
          )}
          <p className="px-1 text-center text-[11px] font-semibold leading-snug text-ink/40">🛡️ {t('social.chat.note')}</p>
        </form>
      )}

      {menu && (
        <MessageMenu
          rect={menu.rect}
          mine={menu.message.mine}
          current={view.messages.find((m) => m.id === menu.message.id)?.reactions.find((r) => r.mine)?.emoji ?? null}
          canReact={canReact}
          canReply={canReply}
          canCopy={menu.message.kind === 'text'}
          onReact={(emoji) => react(view.messages.find((m) => m.id === menu.message.id) ?? menu.message, emoji)}
          onReply={() => reply(menu.message)}
          onCopy={() => void navigator.clipboard?.writeText(menu.message.text).catch(() => {})}
          onClose={() => setMenu(null)}
        />
      )}
      {recording === 'video' && <VideoNoteRecorder onSend={(recorded) => sendRecording('video', recorded)} onClose={() => setRecording(null)} />}
    </div>
  )
}
