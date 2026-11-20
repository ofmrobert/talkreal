import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { isScenario } from '../../shared/scenarios'
import { TEACHERS } from '../../shared/teachers'
import { useAuth } from '../auth/AuthContext'
import TopicPicker, { topicFields, type LastLesson, type Topic } from '../components/call/TopicPicker'
import SpeakButton from '../components/lesson/SpeakButton'
import TeacherAvatar from '../components/TeacherAvatar'
import Button from '../components/ui/Button'
import { api, ApiError } from '../lib/api'

interface Message {
  role: 'student' | 'teacher'
  text: string
  /** The teacher's correction of this (student) message, if it had a mistake. */
  correction?: { better: string; why: string } | null
}

interface Answer {
  reply: string
  correction: { better: string; why: string } | null
  messagesLeft: number | null
}

const MAX_LENGTH = 500

/** A written conversation with an AI teacher. Every message of the student is checked and, if needed, corrected. */
export default function Chat() {
  const { teacherId } = useParams()
  const [query] = useSearchParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const teacher = TEACHERS.find((x) => x.id === teacherId)

  const [topic, setTopic] = useState<Topic>(() => {
    const lesson = query.get('lesson')
    const scenario = query.get('scenario')
    if (lesson) return { kind: 'lesson', id: lesson }
    if (isScenario(scenario)) return { kind: 'scenario', id: scenario }
    return { kind: 'free' }
  })
  const [lastLesson, setLastLesson] = useState<LastLesson | null>(null)
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<{ lastLesson: LastLesson | null; messagesLeft: number | null }>('/voice/status')
      .then((status) => {
        setLastLesson(status.lastLesson)
        setLeft(status.messagesLeft)
        setTopic((current) => (current.kind === 'lesson' && current.id !== status.lastLesson?.id ? { kind: 'free' } : current))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  if (!teacher) return <Navigate to="/talk" replace />

  /** Sends the conversation so far and adds the teacher's answer. An empty conversation makes the teacher open it. */
  async function ask(history: Message[]) {
    setBusy(true)
    setError(null)
    try {
      const answer = await api<Answer>('/chat', {
        teacher: teacher!.id,
        messages: history.map(({ role, text }) => ({ role, text })),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...topicFields(topic),
      })
      const corrected = history.map((m, i) => (i === history.length - 1 && m.role === 'student' ? { ...m, correction: answer.correction } : m))
      setMessages([...corrected, { role: 'teacher', text: answer.reply }])
      setLeft(answer.messagesLeft)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network'
      setError(t(code === 'limit' ? 'chat.limit' : code === 'network' ? 'login.errors.network' : 'chat.failed'))
      if (code === 'limit') setLeft(0)
    } finally {
      setBusy(false)
    }
  }

  function begin() {
    setStarted(true)
    void ask([])
  }

  function send(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    const history: Message[] = [...messages, { role: 'student', text }]
    setMessages(history)
    setDraft('')
    void ask(history)
  }

  const outOfMessages = left !== null && left <= 0
  // If the last message is the student's and has no answer yet, sending failed: let them try again.
  const unanswered = !busy && messages.length > 0 && messages[messages.length - 1].role === 'student'

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-3">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/talk')}
          aria-label={t('lesson.close')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-ink/45 active:bg-ink/10"
        >
          ✕
        </button>
        <TeacherAvatar teacher={teacher.id} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold leading-tight">{teacher.name}</h1>
          <p className="truncate text-sm font-semibold text-ink/55">{t('chat.subtitle')}</p>
        </div>
        {left !== null && (
          <span className={`rounded-full px-3 py-1.5 text-sm font-extrabold tabular-nums ${left <= 3 ? 'bg-coral text-white' : 'bg-card'}`} aria-label={t('chat.left')}>
            ✉ {left}
          </span>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-3xl bg-card/60 p-4" aria-live="polite">
        {!started && (
          <div className="m-auto flex w-full flex-col items-center gap-4 text-center">
            <TeacherAvatar teacher={teacher.id} size={110} />
            <p className="max-w-72 text-base font-semibold text-ink/55">{t('chat.intro')}</p>
            <div className="w-full text-left">
              <TopicPicker level={user?.level} lastLesson={lastLesson} value={topic} onChange={setTopic} />
            </div>
          </div>
        )}

        {messages.map((message, i) =>
          message.role === 'teacher' ? (
            <div key={i} className="bubble-in flex max-w-[88%] items-end gap-1.5 self-start">
              <p className="select-text rounded-3xl rounded-bl-md bg-card px-4 py-2.5 text-base font-semibold leading-snug shadow-[0_3px_0_0_rgb(var(--shade)/0.06)]">
                {message.text}
              </p>
              <SpeakButton text={message.text} className="!h-8 !w-8" />
            </div>
          ) : (
            <div key={i} className="flex max-w-[88%] flex-col items-end gap-1 self-end">
              <p className="select-text rounded-3xl rounded-br-md bg-coral px-4 py-2.5 text-base font-semibold leading-snug text-white">{message.text}</p>
              {message.correction && (
                <div className="bubble-in select-text rounded-2xl bg-good-soft px-3 py-2 text-sm leading-snug text-good-ink">
                  <p className="font-extrabold">✎ {message.correction.better}</p>
                  {message.correction.why && <p className="mt-0.5">{message.correction.why}</p>}
                </div>
              )}
              {message.correction === null && <span className="text-xs font-extrabold text-good-ink">✓ {t('chat.noMistakes')}</span>}
            </div>
          ),
        )}

        {busy && (
          <p className="pulse-soft self-start rounded-3xl rounded-bl-md bg-card px-4 py-2.5 text-base font-bold text-ink/45" role="status">
            {t('chat.typing', { name: teacher.name })}
          </p>
        )}
        {error && (
          <div className="flex flex-col items-center gap-2 self-center text-center">
            <p role="alert" className="rounded-2xl bg-bad/15 px-4 py-2 text-base font-bold text-bad-ink">
              {error}
            </p>
            {!outOfMessages && (
              <button type="button" onClick={() => ask(messages)} className="min-h-11 text-base font-extrabold text-coral-ink underline">
                {t('chat.retry')}
              </button>
            )}
          </div>
        )}
        <div ref={bottom} />
      </main>

      {!started ? (
        <Button onClick={begin}>{t('chat.start')}</Button>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) send(e)
            }}
            rows={2}
            lang="en"
            disabled={outOfMessages}
            placeholder={outOfMessages ? t('chat.limit') : t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            className="min-h-14 flex-1 select-text resize-none rounded-2xl border-2 border-ink/10 bg-card px-4 py-3 text-base font-semibold outline-none placeholder:text-ink/35 focus:border-coral disabled:bg-card/50"
          />
          <button
            type="submit"
            disabled={busy || unanswered || outOfMessages || !draft.trim()}
            aria-label={t('chat.send')}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-coral text-2xl font-extrabold text-white shadow-[0_5px_0_0_var(--color-coral-dark)] active:translate-y-1 active:shadow-[0_1px_0_0_var(--color-coral-dark)] disabled:opacity-50"
          >
            ↑
          </button>
        </form>
      )}
    </div>
  )
}
