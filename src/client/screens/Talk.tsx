import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { CallReport } from '../../shared/report'
import { TEACHERS } from '../../shared/teachers'
import ReportCard from '../components/call/ReportCard'
import { MicIcon } from '../components/icons'
import TeacherAvatar from '../components/TeacherAvatar'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'
import { api } from '../lib/api'

interface VoiceStatus {
  available: boolean
  remainingSeconds: number
  dailySeconds: number
  chatAvailable?: boolean
  messagesLeft?: number | null
}

interface PastCall {
  id: string
  teacher: string
  startedAt: string
  seconds: number
  report: CallReport
}

/** Talk tab: call or write to an AI teacher, see what is left today, and reread the reviews of past calls. */
export default function Talk() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [calls, setCalls] = useState<PastCall[]>([])
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)
    api<VoiceStatus>(`/voice/status?tz=${tz}`)
      .then(setStatus)
      .catch(() => setStatus(null))
    api<{ calls: PastCall[] }>('/voice/calls')
      .then((data) => setCalls(data.calls))
      .catch(() => {})
  }, [])

  // Coming from a lesson ("practise with a teacher"): the lesson travels on to the call or the chat.
  const lesson = query.get('lesson')
  const suffix = lesson ? `?lesson=${encodeURIComponent(lesson)}` : ''

  const available = status?.available ?? false
  const chatAvailable = status?.chatAvailable ?? false
  const minutesLeft = status ? Math.floor(status.remainingSeconds / 60) : 0
  const secondsLeft = status ? status.remainingSeconds % 60 : 0
  const outOfTime = available && status!.remainingSeconds <= 0
  const canCall = available && !outOfTime
  const messagesLeft = status?.messagesLeft ?? null
  const canChat = chatAvailable && (messagesLeft === null || messagesLeft > 0)
  const dateFormat = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-1">
        <h1 className="text-3xl font-extrabold">{t('talk.title')}</h1>
        <p className="mt-2 text-base text-ink/65">{available || chatAvailable ? t('talk.subtitleLive') : t('talk.subtitle')}</p>
      </header>

      {lesson && (available || chatAvailable) && (
        <p className="rounded-2xl bg-[#EDE8FF] p-4 text-base font-bold" role="status">
          📘 {t('talk.lessonHint')}
        </p>
      )}

      {(available || chatAvailable) && (
        <section className={`flex flex-col gap-1 rounded-2xl p-4 ${outOfTime ? 'bg-coral/15' : 'bg-mint/20'}`}>
          {available && (
            <p className="flex items-center gap-2 text-base font-bold">
              <MicIcon width={22} height={22} className={outOfTime ? 'text-coral-dark' : 'text-[#0E6B55]'} />
              {outOfTime ? t('talk.noTime') : t('talk.timeLeft', { time: `${minutesLeft}:${String(secondsLeft).padStart(2, '0')}` })}
            </p>
          )}
          {chatAvailable && messagesLeft !== null && (
            <p className="flex items-center gap-2 text-base font-bold">
              <span className="w-[22px] text-center" aria-hidden="true">
                ✉
              </span>
              {t('talk.messagesLeft', { count: messagesLeft })}
            </p>
          )}
        </section>
      )}

      {TEACHERS.map((teacher) => (
        <Card key={teacher.id} className="flex flex-col gap-3">
          <div className="flex items-start gap-4">
            <TeacherAvatar teacher={teacher.id} size={72} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold">{teacher.name}</h2>
                {!available && !chatAvailable && <Badge>{t('common.soon')}</Badge>}
              </div>
              <p className="text-sm font-bold text-ink/55">{t(`teachers.${teacher.id}.role`)}</p>
              <p className="mt-1 text-base text-ink/75">{t(`teachers.${teacher.id}.style`)}</p>
            </div>
          </div>
          {(available || chatAvailable) && (
            <div className="flex gap-2">
              {available && (
                <button
                  type="button"
                  disabled={!canCall}
                  onClick={() => navigate(`/talk/${teacher.id}${suffix}`)}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-coral text-base font-extrabold text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 active:shadow-[0_1px_0_0_var(--color-coral-dark)] disabled:opacity-50"
                >
                  <MicIcon width={20} height={20} />
                  {t('talk.call')}
                </button>
              )}
              {chatAvailable && (
                <button
                  type="button"
                  disabled={!canChat}
                  onClick={() => navigate(`/chat/${teacher.id}${suffix}`)}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white text-base font-extrabold text-ink shadow-[0_4px_0_0_rgba(31,27,58,0.14)] ring-2 ring-inset ring-ink/10 active:translate-y-1 active:shadow-[0_1px_0_0_rgba(31,27,58,0.14)] disabled:opacity-50"
                >
                  <span aria-hidden="true">✉</span>
                  {t('talk.write')}
                </button>
              )}
            </div>
          )}
        </Card>
      ))}

      {calls.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="mt-2 text-xl font-extrabold">{t('talk.reviews')}</h2>
          {calls.map((call) => {
            const teacher = TEACHERS.find((x) => x.id === call.teacher)
            const isOpen = open === call.id
            return (
              <div key={call.id} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : call.id)}
                  aria-expanded={isOpen}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-[0_4px_0_0_rgba(31,27,58,0.06)] active:translate-y-0.5"
                >
                  {teacher && <TeacherAvatar teacher={teacher.id} size={44} />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-extrabold">{teacher?.name ?? call.teacher}</span>
                    <span className="block text-sm font-semibold text-ink/55">
                      {dateFormat.format(new Date(call.startedAt))} · {t('talk.minutes', { count: Math.max(1, Math.round(call.seconds / 60)) })} ·{' '}
                      {t('talk.mistakes', { count: call.report.corrections.length })}
                    </span>
                  </span>
                  <span className={`text-xl font-extrabold text-ink/35 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">
                    ›
                  </span>
                </button>
                {isOpen && <ReportCard report={call.report} />}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
