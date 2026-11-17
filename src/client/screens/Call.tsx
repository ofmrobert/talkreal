import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { TEACHERS } from '../../shared/teachers'
import { MicIcon } from '../components/icons'
import Button from '../components/ui/Button'
import { VoiceCall, type EndReason } from '../lib/voiceCall'

type Stage = 'idle' | 'connecting' | 'live' | 'ended'

interface Line {
  role: 'student' | 'teacher'
  text: string
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`

/** The live conversation with one AI teacher: big mic, running transcript, time left. */
export default function Call() {
  const { teacherId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const teacher = TEACHERS.find((x) => x.id === teacherId)

  const [stage, setStage] = useState<Stage>('idle')
  const [lines, setLines] = useState<Line[]>([])
  const [remaining, setRemaining] = useState<number | null>(null)
  const [micLevel, setMicLevel] = useState(0)
  const [teacherSpeaking, setTeacherSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [endReason, setEndReason] = useState<EndReason | null>(null)

  const call = useRef<VoiceCall | null>(null)
  /** True when the next piece of transcript should start a new bubble. */
  const newBubble = useRef(true)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => () => call.current?.hangUp(), [])
  useEffect(() => {
    // Braces matter: newer browsers return a value from scrollIntoView, and an effect must not return it.
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  if (!teacher) return <Navigate to="/talk" replace />

  function start() {
    setStage('connecting')
    setLines([])
    setEndReason(null)
    setMuted(false)
    newBubble.current = true
    const next = new VoiceCall(teacher!.id, {
      onReady: (seconds) => {
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
      },
    })
    call.current = next
    void next.start()
  }

  function toggleMute() {
    if (!call.current) return
    call.current.muted = !muted
    setMuted(!muted)
  }

  const initial = teacher.name.replace(/^(Miss|Mr\.)\s/, '')[0]
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
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold text-white ${teacherSpeaking ? 'pulse-ring' : ''}`}
          style={{ backgroundColor: teacher.color }}
          aria-hidden="true"
        >
          {initial}
        </div>
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

      {/* Live transcript */}
      <main className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-3xl bg-white/60 p-4" aria-live="polite">
        {lines.length === 0 && (
          <p className="m-auto max-w-64 text-center text-base font-semibold text-ink/50">
            {stage === 'idle' || stage === 'ended' ? t(`teachers.${teacher.id}.style`) : t('call.transcriptHint')}
          </p>
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
