import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { CallReport, ReportStatus } from '../../shared/report'
import { isScenario } from '../../shared/scenarios'
import { TEACHERS } from '../../shared/teachers'
import { useAuth } from '../auth/AuthContext'
import ReportCard from '../components/call/ReportCard'
import TopicPicker, { topicFields, type LastLesson, type Topic } from '../components/call/TopicPicker'
import { MicIcon } from '../components/icons'
import TeacherAvatar from '../components/TeacherAvatar'
import Button from '../components/ui/Button'
import { api } from '../lib/api'
import { VoiceCall, type EndReason } from '../lib/voiceCall'

type Stage = 'idle' | 'connecting' | 'live' | 'ended'

interface Line {
  role: 'student' | 'teacher'
  text: string
}

/** The review is written after the call ends; the app asks for it this often, this many times. */
const REPORT_POLL_MS = 2000
const REPORT_POLLS = 25
/** Right after hanging up the server may not have decided yet whether there will be a review. */
const REPORT_GRACE_POLLS = 3

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`

/** The live conversation with one AI teacher: choose a topic, talk, then read the teacher's review. */
export default function Call() {
  const { teacherId } = useParams()
  const [query] = useSearchParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const teacher = TEACHERS.find((x) => x.id === teacherId)

  const [stage, setStage] = useState<Stage>('idle')
  const [topic, setTopic] = useState<Topic>(() => {
    const lesson = query.get('lesson')
    const scenario = query.get('scenario')
    if (lesson) return { kind: 'lesson', id: lesson }
    if (isScenario(scenario)) return { kind: 'scenario', id: scenario }
    return { kind: 'free' }
  })
  const [lastLesson, setLastLesson] = useState<LastLesson | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [remaining, setRemaining] = useState<number | null>(null)
  const [micLevel, setMicLevel] = useState(0)
  const [teacherSpeaking, setTeacherSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [endReason, setEndReason] = useState<EndReason | null>(null)
  const [report, setReport] = useState<CallReport | null>(null)
  const [reportStatus, setReportStatus] = useState<ReportStatus>('none')

  const call = useRef<VoiceCall | null>(null)
  const callId = useRef<string | null>(null)
  /** True when the next piece of transcript should start a new bubble. */
  const newBubble = useRef(true)
  const bottom = useRef<HTMLDivElement>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      call.current?.hangUp()
      if (pollTimer.current) clearTimeout(pollTimer.current)
    },
    [],
  )
  useEffect(() => {
    // Braces matter: newer browsers return a value from scrollIntoView, and an effect must not return it.
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, report, reportStatus])

  useEffect(() => {
    api<{ lastLesson: LastLesson | null }>('/voice/status')
      .then((status) => {
        setLastLesson(status.lastLesson)
        // A lesson link that is not the student's latest lesson falls back to a free conversation.
        setTopic((current) => (current.kind === 'lesson' && current.id !== status.lastLesson?.id ? { kind: 'free' } : current))
      })
      .catch(() => {})
  }, [])

  if (!teacher) return <Navigate to="/talk" replace />

  /** Asks for the teacher's review until it is ready (or it is clear there will not be one). */
  function waitForReport(id: string, attempt = 0) {
    api<{ status: ReportStatus; report: CallReport | null }>(`/voice/calls/${id}/report`)
      .then(({ status, report }) => {
        if (status === 'ready' && report) {
          setReport(report)
          setReportStatus('ready')
          void refresh()
        } else if ((status === 'pending' || attempt < REPORT_GRACE_POLLS) && attempt < REPORT_POLLS) {
          if (status === 'pending') setReportStatus('pending')
          pollTimer.current = setTimeout(() => waitForReport(id, attempt + 1), REPORT_POLL_MS)
        } else {
          setReportStatus(status === 'pending' ? 'failed' : status)
        }
      })
      .catch(() => setReportStatus('failed'))
  }

  function start() {
    setStage('connecting')
    setLines([])
    setEndReason(null)
    setMuted(false)
    setReport(null)
    setReportStatus('none')
    if (pollTimer.current) clearTimeout(pollTimer.current)
    callId.current = null
    newBubble.current = true
    const next = new VoiceCall(
      teacher!.id,
      {
        onReady: (seconds, id) => {
          callId.current = id
          setRemaining(seconds)
          setStage('live')
        },
        onTranscript: (role, text) =>
          setLines((current) => {
            const last = current[current.length - 1]
            if (last && last.role === role && !newBubble.current) {
              return [...current.slice(0, -1), { role, text: last.text + text }]
            }
            newBubble.current = false
            return [...current, { role, text }]
          }),
        onTurnComplete: () => {
          newBubble.current = true
        },
        onTick: setRemaining,
        onMicLevel: setMicLevel,
        onTeacherSpeaking: setTeacherSpeaking,
        onEnd: (reason) => {
          setEndReason(reason)
          setStage('ended')
          setMicLevel(0)
          setTeacherSpeaking(false)
          if (callId.current) waitForReport(callId.current)
        },
      },
      topicFields(topic),
    )
    call.current = next
    void next.start()
  }

  function toggleMute() {
    if (!call.current) return
    call.current.muted = !muted
    setMuted(!muted)
  }

  const lowTime = remaining !== null && remaining <= 30
  const status =
    stage === 'connecting'
      ? t('call.connecting')
      : stage === 'live'
        ? teacherSpeaking
          ? t('call.speaking', { name: teacher.name })
          : muted
            ? t('call.muted')
            : t('call.listening')
        : stage === 'ended'
          ? t(`call.ended.${endReason ?? 'hangup'}`)
          : t('call.intro')

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-4">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/talk')}
          aria-label={t('lesson.close')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-ink/45 active:bg-ink/10"
        >
          ✕
        </button>
        <TeacherAvatar teacher={teacher.id} size={48} speaking={teacherSpeaking} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold leading-tight">{teacher.name}</h1>
          <p className="truncate text-sm font-semibold text-ink/55">{t(`teachers.${teacher.id}.role`)}</p>
        </div>
        {remaining !== null && (
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-extrabold tabular-nums ${lowTime ? 'bg-coral text-white' : 'bg-white'}`}
            aria-label={t('call.timeLeft')}
          >
            {clock(remaining)}
          </span>
        )}
      </header>

      {/* Live transcript, and the teacher's review once the call is over */}
      <main className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-3xl bg-white/60 p-4" aria-live="polite">
        {lines.length === 0 && (
          <div className="m-auto flex w-full flex-col items-center gap-4 text-center">
            <span className={`rounded-full ${stage === 'connecting' ? 'pulse-soft' : ''}`}>
              <TeacherAvatar teacher={teacher.id} size={stage === 'idle' ? 110 : 150} speaking={teacherSpeaking} />
            </span>
            <p className="max-w-64 text-base font-semibold text-ink/55">
              {stage === 'idle' || stage === 'ended' ? t(`teachers.${teacher.id}.style`) : t('call.transcriptHint')}
            </p>
            {stage === 'idle' && (
              <div className="w-full text-left">
                <TopicPicker level={user?.level} lastLesson={lastLesson} value={topic} onChange={setTopic} />
              </div>
            )}
          </div>
        )}
        {lines.map((line, i) => (
          <p
            key={i}
            className={`max-w-[85%] select-text rounded-3xl px-4 py-2.5 text-base leading-snug ${
              line.role === 'teacher'
                ? 'self-start rounded-bl-md bg-white font-semibold shadow-[0_3px_0_0_rgba(31,27,58,0.06)]'
                : 'self-end rounded-br-md bg-coral font-semibold text-white'
            }`}
          >
            {line.text}
          </p>
        ))}
        {stage === 'ended' && reportStatus === 'pending' && (
          <p className="pulse-soft self-center rounded-2xl bg-white px-4 py-3 text-base font-bold text-ink/65" role="status">
            {t('report.pending', { name: teacher.name })}
          </p>
        )}
        {stage === 'ended' && reportStatus === 'failed' && (
          <p className="self-center rounded-2xl bg-white px-4 py-3 text-center text-base font-bold text-ink/55">{t('report.failed')}</p>
        )}
        {stage === 'ended' && report && <ReportCard report={report} />}
        <div ref={bottom} />
      </main>

      <footer className="flex flex-col items-center gap-4 pb-1">
        <p className={`min-h-6 text-center text-base font-bold ${stage === 'ended' && endReason !== 'hangup' ? 'text-coral-dark' : 'text-ink/60'}`} role="status">
          {status}
        </p>

        {stage === 'live' || stage === 'connecting' ? (
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={toggleMute}
              disabled={stage !== 'live'}
              aria-pressed={muted}
              aria-label={muted ? t('call.unmute') : t('call.mute')}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-extrabold disabled:opacity-40 ${muted ? 'bg-ink text-white' : 'bg-white text-ink'}`}
            >
              {muted ? '🔇' : '🎙️'}
            </button>

            {/* The big mic: its halo grows with the student's voice */}
            <div className="relative flex h-28 w-28 items-center justify-center">
              <span
                className="absolute inset-0 rounded-full bg-coral/25 transition-transform duration-100"
                style={{ transform: `scale(${1 + micLevel * 0.45})` }}
                aria-hidden="true"
              />
              <span className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-coral text-white shadow-[0_6px_0_0_var(--color-coral-dark)] ${stage === 'connecting' ? 'opacity-60' : ''}`}>
                <MicIcon width={44} height={44} />
              </span>
            </div>

            <button
              type="button"
              onClick={() => call.current?.hangUp()}
              aria-label={t('call.hangUp')}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-xl font-extrabold text-white active:translate-y-0.5"
            >
              ✕
            </button>
          </div>
        ) : (
          <Button onClick={start} disabled={endReason === 'limit'}>
            <MicIcon width={22} height={22} />
            {stage === 'ended' ? t('call.again') : t('call.start')}
          </Button>
        )}
      </footer>
    </div>
  )
}
