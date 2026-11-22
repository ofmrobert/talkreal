import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { WAVEFORM_BARS } from '../../../shared/social'
import { clock } from '../../lib/recorder'

/* ───────────── Icons ───────────── */

const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
export const PlayIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.2v13.6a1 1 0 0 0 1.5.9l11-6.8a1 1 0 0 0 0-1.8l-11-6.8A1 1 0 0 0 8 5.2z" />
  </svg>
)
export const PauseIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4.5" height="14" rx="1.5" />
    <rect x="13.5" y="5" width="4.5" height="14" rx="1.5" />
  </svg>
)
export const MicIcon = ({ size = 22 }: { size?: number }) =>
  svg(
    size,
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>,
  )
/** A camera inside a circle: a round video note. */
export const VideoNoteIcon = ({ size = 22 }: { size?: number }) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9.5" />
      <rect x="7" y="9" width="7" height="6" rx="1.5" />
      <path d="M14 11.2l3-1.7v5l-3-1.7" />
    </>,
  )
export const TrashIcon = ({ size = 20 }: { size?: number }) => svg(size, <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />)
export const SendIcon = ({ size = 22 }: { size?: number }) => svg(size, <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />)
export const StopIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="3" />
  </svg>
)

/* ───────────── Playing ───────────── */

/** Where a delivered recording is loaded from. */
export const mediaUrl = (messageId: string) => `/api/social/messages/media/${messageId}`

/** Only one recording plays at a time: starting another stops this one. */
let playing: HTMLMediaElement | null = null
function takeOver(element: HTMLMediaElement) {
  if (playing && playing !== element) playing.pause()
  playing = element
}

/** Calls `tick` on every frame while `on` is true. */
function useFrames(on: boolean, tick: () => void) {
  const latest = useRef(tick)
  latest.current = tick
  useEffect(() => {
    if (!on) return
    let frame = requestAnimationFrame(function loop() {
      latest.current()
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [on])
}

const RATES = [1, 0.75, 1.5]

/** What the AI heard in a recording: the feedback on pronunciation. */
function Heard({ text, tone }: { text: string; tone: 'mine' | 'theirs' }) {
  const { t } = useTranslation()
  return (
    <p className={`rounded-xl px-2.5 py-1.5 text-sm font-semibold leading-snug ${tone === 'mine' ? 'bg-white/20 text-white' : 'bg-ink/5 text-ink/75'}`}>
      <span className={`block text-[11px] font-extrabold uppercase tracking-wide ${tone === 'mine' ? 'text-white/75' : 'text-ink/45'}`}>{t('social.chat.heard')}</span>
      {text}
    </p>
  )
}

/**
 * A voice message: a round play button, the picture of its loudness that fills as it plays,
 * the time, a speed switch (slower helps to catch every word) and what the AI heard.
 */
export function VoicePlayer({ src, seconds, waveform, transcript, tone, compact = false }: { src: string; seconds: number; waveform: string | null; transcript?: string | null; tone: 'mine' | 'theirs'; /** One slim row, for the box to write. */ compact?: boolean }) {
  const { t } = useTranslation()
  const audio = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<'idle' | 'playing' | 'paused' | 'error'>('idle')
  const [at, setAt] = useState(0)
  const [rate, setRate] = useState(0)
  const [showText, setShowText] = useState(false)
  useFrames(state === 'playing', () => setAt(audio.current?.currentTime ?? 0))
  useEffect(
    () => () => {
      audio.current?.pause()
      if (playing === audio.current) playing = null
    },
    [],
  )

  /** Runs straight from the tap: phones only start sound that way. */
  function toggle() {
    if (state === 'playing') return audio.current?.pause()
    if (!audio.current) {
      const element = new Audio(src)
      element.onplay = () => setState('playing')
      element.onpause = () => setState((now) => (now === 'playing' ? 'paused' : now))
      element.onended = () => {
        setState('idle')
        setAt(0)
      }
      element.onerror = () => setState('error')
      audio.current = element
    }
    takeOver(audio.current)
    audio.current.playbackRate = RATES[rate]
    audio.current.play().catch(() => setState('error'))
  }

  const bars = waveform && waveform.length === WAVEFORM_BARS ? waveform : '3'.repeat(WAVEFORM_BARS)
  const done = Math.min(1, at / Math.max(1, seconds))
  const mine = tone === 'mine'
  const chip = `flex h-6 min-w-9 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold ${mine ? 'bg-white/20 text-white' : 'bg-ink/8 text-ink/60'}`
  const time = state === 'error' ? t('social.chat.cantPlay') : clock(state === 'idle' ? seconds : at)
  const button = (
    <button
      type="button"
      onClick={toggle}
      aria-label={t(state === 'playing' ? 'social.chat.pause' : 'social.chat.play')}
      className={`flex shrink-0 items-center justify-center rounded-full active:scale-95 ${compact ? 'h-8 w-8' : 'h-11 w-11'} ${mine ? 'bg-white text-coral' : 'bg-coral text-white'}`}
    >
      {state === 'playing' ? <PauseIcon size={compact ? 16 : 20} /> : <PlayIcon size={compact ? 16 : 20} />}
    </button>
  )
  // The bars share whatever width there is, so the picture fits a narrow box as well as a bubble.
  const picture = (
    <div className={`flex min-w-0 flex-1 items-center justify-between gap-px ${compact ? 'h-6' : 'h-7'}`} aria-hidden="true">
      {[...bars].map((digit, i) => (
        <span
          key={i}
          className={`min-w-0 max-w-[3px] flex-1 rounded-full transition-colors ${(i + 0.5) / WAVEFORM_BARS <= done && state !== 'idle' ? (mine ? 'bg-white' : 'bg-coral') : mine ? 'bg-white/45' : 'bg-ink/25'}`}
          style={{ height: `${14 + (Number(digit) / 9) * 86}%` }}
        />
      ))}
    </div>
  )
  if (compact)
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {button}
        {picture}
        <span className="shrink-0 text-xs font-bold tabular-nums text-ink/50">{time}</span>
      </div>
    )
  return (
    <div className="flex w-60 max-w-full flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        {button}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex">{picture}</div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-bold tabular-nums ${mine ? 'text-white/85' : 'text-ink/50'}`}>{time}</span>
            <span className="flex gap-1">
              {transcript && (
                <button type="button" onClick={() => setShowText(!showText)} aria-pressed={showText} aria-label={t('social.chat.heard')} className={`${chip} ${showText ? (mine ? '!bg-white !text-coral' : '!bg-coral !text-white') : ''}`}>
                  Aa
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const next = (rate + 1) % RATES.length
                  setRate(next)
                  if (audio.current) audio.current.playbackRate = RATES[next]
                }}
                aria-label={t('social.chat.speed')}
                className={chip}
              >
                {RATES[rate]}×
              </button>
            </span>
          </div>
        </div>
      </div>
      {showText && transcript && <Heard text={transcript} tone={tone} />}
    </div>
  )
}

/** A thin ring around a video note that fills as it plays or records. */
export function Ring({ progress, className }: { progress: number; className: string }) {
  const r = 48.5
  const length = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="2" className="stroke-ink/10" />
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - Math.min(1, Math.max(0, progress)))} className={className} />
    </svg>
  )
}

/** A video note: a round video. A tap plays it with sound from the start; another tap pauses. */
export function VideoNote({ src, seconds, transcript, tone }: { src: string; seconds: number; transcript?: string | null; tone: 'mine' | 'theirs' }) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'idle' | 'playing' | 'paused' | 'error'>('idle')
  const [at, setAt] = useState(0)
  const [showText, setShowText] = useState(false)
  useFrames(state === 'playing', () => setAt(video.current?.currentTime ?? 0))
  useEffect(
    () => () => {
      if (playing === video.current) playing = null
    },
    [],
  )

  function toggle() {
    const element = video.current
    if (!element) return
    if (state === 'playing') return element.pause()
    if (state === 'idle') element.currentTime = 0
    element.muted = false
    takeOver(element)
    element.play().catch(() => setState('error'))
  }

  return (
    <div className={`flex flex-col gap-1.5 ${tone === 'mine' ? 'items-end' : 'items-start'}`}>
      <div className="relative h-56 w-56">
        <Ring progress={state === 'idle' ? 0 : at / Math.max(1, seconds)} className="stroke-coral" />
        <button type="button" onClick={toggle} aria-label={t(state === 'playing' ? 'social.chat.pause' : 'social.chat.play')} className="absolute inset-[5px] overflow-hidden rounded-full bg-night">
          <video
            ref={video}
            // The fragment makes phones show the first picture instead of a black circle.
            src={`${src}#t=0.1`}
            playsInline
            muted
            preload="metadata"
            onPlay={() => setState('playing')}
            onPause={() => setState((now) => (now === 'playing' ? 'paused' : now))}
            onEnded={() => {
              setState('idle')
              setAt(0)
            }}
            onError={() => setState('error')}
            className="h-full w-full object-cover"
          />
          {state !== 'playing' && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/15">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">{state === 'error' ? '!' : <PlayIcon size={22} />}</span>
            </span>
          )}
        </button>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold tabular-nums text-white">{clock(state === 'idle' ? seconds : at)}</span>
        {transcript && (
          <button
            type="button"
            onClick={() => setShowText(!showText)}
            aria-pressed={showText}
            aria-label={t('social.chat.heard')}
            className={`absolute bottom-2 right-2 flex h-6 min-w-9 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold ${showText ? 'bg-coral text-white' : 'bg-black/55 text-white'}`}
          >
            Aa
          </button>
        )}
      </div>
      {state === 'error' && <p className="max-w-56 text-xs font-bold text-ink/50">{t('social.chat.cantPlay')}</p>}
      {showText && transcript && (
        <div className="max-w-56 rounded-2xl bg-card shadow-sm">
          <Heard text={transcript} tone="theirs" />
        </div>
      )}
    </div>
  )
}
